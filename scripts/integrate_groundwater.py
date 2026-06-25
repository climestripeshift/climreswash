"""
Integrate groundwater stress into hex grid: amplifies drought sensitivity,
reduces adaptive capacity. District-level join from WRIS well data.

Run: python scripts/integrate_groundwater.py
"""
import csv
import json
import re
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
GW_CSV    = ROOT / "data/groundwater_district.csv"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO   = ROOT / "client/public/data/india_hex_grid.geojson"

# ── Config (tunable) ──────────────────────────────────────────────────────────
GW_WEIGHT     = 0.5   # how much groundwater stress amplifies drought sensitivity
AC_GW_PENALTY = 0.2   # how much groundwater stress reduces adaptive capacity
GW_DEFAULT    = 0.1   # default stress for districts with no well data
# ──────────────────────────────────────────────────────────────────────────────


def normalize(name: str) -> str:
    return re.sub(r'[^a-z0-9]', '', name.lower().strip())


def main():
    print(f"Loading {GW_CSV}...")
    with open(GW_CSV) as f:
        gw_rows = list(csv.DictReader(f))
    print(f"  {len(gw_rows)} groundwater districts")

    # Build lookup: (normalized_state, normalized_district) → gw_stress_score
    gw_lookup: dict[tuple[str, str], float] = {}
    for row in gw_rows:
        key = (normalize(row["state"]), normalize(row["district"]))
        gw_lookup[key] = float(row.get("gw_stress_score", GW_DEFAULT) or GW_DEFAULT)

    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # ── Step 1: Join groundwater to hexes ──────────────────────────────────
    matched = 0
    defaulted = 0
    unmatched_districts: set[str] = set()

    for p in props:
        state = p.get("state", "")
        district = p.get("district_name", "")
        if not district or district == "Unknown":
            p["gw_stress_score"] = GW_DEFAULT
            defaulted += 1
            continue

        ns, nd = normalize(state), normalize(district)

        # Try exact normalized match
        gw = gw_lookup.get((ns, nd))

        # Try prefix match (WRIS names may be abbreviated)
        if gw is None:
            for (gs, gd), score in gw_lookup.items():
                if gs == ns and (gd.startswith(nd[:5]) or nd.startswith(gd[:5])):
                    gw = score
                    break

        # Try district-only match (state names differ between sources)
        if gw is None:
            for (gs, gd), score in gw_lookup.items():
                if gd == nd:
                    gw = score
                    break

        if gw is not None:
            p["gw_stress_score"] = round(gw, 3)
            matched += 1
        else:
            p["gw_stress_score"] = GW_DEFAULT
            defaulted += 1
            unmatched_districts.add(f"{district}, {state}")

    print(f"\n  Matched:   {matched} hexes ({matched*100//len(props)}%)")
    print(f"  Defaulted: {defaulted} hexes (gw_stress={GW_DEFAULT})")
    print(f"  Unmatched districts: {len(unmatched_districts)}")
    if unmatched_districts:
        for d in sorted(unmatched_districts)[:10]:
            print(f"    - {d}")

    # ── Step 2: Capture BEFORE values for validation ───────────────────────
    sample_districts = ["Banaskantha", "Jhunjhunu", "Patan", "Kurukshetra", "Rewari",
                        "Wayanad", "Kamrup", "Ernakulam", "Patna", "Pune"]
    before: dict[str, dict] = {}
    for p in props:
        d = p.get("district_name", "")
        if d in sample_districts and d not in before:
            before[d] = {
                "state": p.get("state", ""),
                "gw": p["gw_stress_score"],
                "drought_risk": p.get("drought_risk", 0),
                "hex_risk": p.get("hex_risk", 0),
                "ac": p.get("adaptive_capacity", 0),
            }

    # ── Step 3: Save with gw_stress_score ──────────────────────────────────
    print(f"\nSaving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    # Also update GeoJSON
    if HEX_GEO.exists():
        print(f"Updating {HEX_GEO}...")
        with open(HEX_GEO) as f:
            gj = json.load(f)
        props_by_id = {p["h3_id"]: p for p in props}
        for feat in gj["features"]:
            h3_id = feat["properties"].get("h3_id")
            if h3_id in props_by_id:
                feat["properties"]["gw_stress_score"] = props_by_id[h3_id]["gw_stress_score"]
        with open(HEX_GEO, "w") as f:
            json.dump(gj, f, separators=(",", ":"))

    # Stats
    gw_vals = [p["gw_stress_score"] for p in props]
    print(f"\n  gw_stress_score: {min(gw_vals):.3f} – {max(gw_vals):.3f} (mean {sum(gw_vals)/len(gw_vals):.3f})")
    high_stress = sum(1 for v in gw_vals if v > 0.7)
    print(f"  High stress (>0.7): {high_stress} hexes")

    # Print before values for later comparison
    print(f"\n  BEFORE groundwater integration (sample districts):")
    print(f"  {'District':25s} {'State':18s} {'GW':>5s} {'drought_r':>9s} {'hex_risk':>8s} {'AC':>6s}")
    for d in sample_districts:
        if d in before:
            b = before[d]
            print(f"  {d:25s} {b['state']:18s} {b['gw']:5.3f} {b['drought_risk']:9.2f} {b['hex_risk']:8.2f} {b['ac']:6.3f}")

    import os
    print(f"\nDone. Props: {os.path.getsize(HEX_PROPS)//1024} KB")
    print(f"\nNext: run join_hex_districts.py to recompute risk with groundwater-adjusted sensitivity + AC")


if __name__ == "__main__":
    main()
