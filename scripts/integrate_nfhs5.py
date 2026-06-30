"""
Integrate NFHS-5 district-level WASH data into hex grid.
Replaces state-level averages with real district-level indicators.

Run: python scripts/integrate_nfhs5.py
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import adaptive_capacity

ROOT      = Path(__file__).resolve().parent.parent
NFHS_CSV  = ROOT / "data/nfhs5_district_wash.csv"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO   = ROOT / "client/public/data/india_hex_grid.geojson"
MPI_FILE  = ROOT / "scripts/nfhs5_poverty_mpi.json"


def normalize(name: str) -> str:
    """Normalize district name for fuzzy matching."""
    return (name.lower().strip()
            .replace(" & ", " and ")
            .replace("&", " and ")
            .replace("-", " ")
            .replace("(", "").replace(")", "")
            .replace("  ", " "))


def main():
    # Load NFHS-5
    print(f"Loading {NFHS_CSV}...")
    with open(NFHS_CSV) as f:
        nfhs_rows = list(csv.DictReader(f))
    print(f"  {len(nfhs_rows)} NFHS-5 districts")

    # Build lookup by normalized name
    nfhs_by_name: dict[str, dict] = {}
    for row in nfhs_rows:
        key = normalize(row["district"])
        nfhs_by_name[key] = row

    # Load MPI
    mpi = json.loads(MPI_FILE.read_text()) if MPI_FILE.exists() else {}

    # Load hex props
    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # Match and apply NFHS-5 data
    matched = 0
    unmatched_districts: set[str] = set()

    for p in props:
        district = p.get("district_name", "")
        state = p.get("state", "")
        if not district or district == "Unknown":
            continue

        # Try exact, then normalized, then prefix match
        norm = normalize(district)
        row = nfhs_by_name.get(norm)

        if not row:
            # Try prefix match (e.g. "Agar" → "Agar Malwa")
            for nfhs_key, nfhs_row in nfhs_by_name.items():
                if nfhs_key.startswith(norm[:5]) or norm.startswith(nfhs_key[:5]):
                    if normalize(nfhs_row.get("state", "")) in normalize(state) or normalize(state) in normalize(nfhs_row.get("state", "")):
                        row = nfhs_row
                        break

        if row:
            matched += 1
            # Store key WASH indicators
            p["wash_water_pct"]       = float(row.get("improved_water_pct", 0) or 0)
            p["wash_sanitation_pct"]  = float(row.get("improved_sanitation_pct", 0) or 0)
            p["wash_electricity_pct"] = float(row.get("electricity_pct", 0) or 0)
            p["wash_literacy_pct"]    = float(row.get("female_literacy_pct", 0) or 0)
            p["wash_health_pct"]      = float(row.get("institutional_births_pct", 0) or 0)
            p["wash_stunting_pct"]    = float(row.get("children_stunted_pct", 0) or 0)
            p["wash_wasting_pct"]     = float(row.get("children_wasted_pct", 0) or 0)
            p["wash_diarrhoea_pct"]   = float(row.get("diarrhoea_prev_pct", 0) or 0)
            p["wash_vaccination_pct"] = float(row.get("fully_vaccinated_pct", 0) or 0)
            p["wash_anaemia_pct"]     = float(row.get("children_anaemic_pct", 0) or 0)

            # Compute district-level AC
            poverty = mpi.get(state, 20)
            ac = adaptive_capacity(
                toilet_pct=p["wash_sanitation_pct"],
                piped_water_pct=p["wash_water_pct"],
                health_access_pct=p["wash_health_pct"],
                electricity_pct=p["wash_electricity_pct"],
                poverty_pct=poverty,
                female_literacy_pct=p["wash_literacy_pct"],
            )
            p["adaptive_capacity"] = round(ac, 3)
        else:
            unmatched_districts.add(district)

    print(f"\n  Matched: {matched}/{len(props)} hexes ({matched*100//len(props)}%)")
    print(f"  Unmatched districts: {len(unmatched_districts)}")
    if unmatched_districts:
        for d in sorted(unmatched_districts)[:15]:
            print(f"    - {d}")

    # Stats
    ac_vals = [p["adaptive_capacity"] for p in props if p.get("adaptive_capacity") is not None]
    print(f"\n  Adaptive Capacity (district-level):")
    print(f"    Range: {min(ac_vals):.3f} – {max(ac_vals):.3f}")
    print(f"    Mean:  {sum(ac_vals)/len(ac_vals):.3f}")

    # Sample
    for d in ["Patna", "Mumbai Suburban", "Jaisalmer", "Wayanad", "Leh(Ladakh)"]:
        for p in props:
            if p.get("district_name") == d and "adaptive_capacity" in p:
                print(f"    {d}: AC={p['adaptive_capacity']} (sanit={p['wash_sanitation_pct']}%, water={p['wash_water_pct']}%, health={p['wash_health_pct']}%)")
                break

    # Save
    print(f"\nSaving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    # Update GeoJSON
    if HEX_GEO.exists():
        print(f"Updating {HEX_GEO}...")
        with open(HEX_GEO) as f:
            gj = json.load(f)
        props_by_id = {p["h3_id"]: p for p in props}
        wash_keys = ["wash_water_pct", "wash_sanitation_pct", "wash_electricity_pct",
                     "wash_literacy_pct", "wash_health_pct", "wash_stunting_pct",
                     "wash_diarrhoea_pct", "wash_vaccination_pct", "wash_anaemia_pct",
                     "adaptive_capacity"]
        for feat in gj["features"]:
            h3_id = feat["properties"].get("h3_id")
            if h3_id in props_by_id:
                src = props_by_id[h3_id]
                for k in wash_keys:
                    if k in src:
                        feat["properties"][k] = src[k]
        with open(HEX_GEO, "w") as f:
            json.dump(gj, f, separators=(",", ":"))

    import os
    print(f"\nDone. Props: {os.path.getsize(HEX_PROPS)//1024} KB")


if __name__ == "__main__":
    main()
