"""
Spatial-join hex grid to districts, inherit district-level indicators,
compute per-hex risk scores using formulas.py with real NFHS-5 WASH data.

Hierarchy: hex → district → state → country

Run: python scripts/join_hex_districts.py
"""
import json
import sys
from pathlib import Path

import geopandas as gpd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.hex_risk import RISK_COLS, build_wash_state_context, compute_hex_risk

ROOT         = Path(__file__).resolve().parent.parent
HEX_FILE     = ROOT / "client/public/data/india_hex_grid.geojson"
DISTRICTS    = ROOT / "client/public/data/india.json"
SOIL_SAND    = ROOT / "client/public/data/hex_soil_sand.json"


def main():
    # 1. Load hexes and districts
    print("Loading hex grid...")
    hexes = gpd.read_file(str(HEX_FILE))
    if hexes.crs is None:
        hexes = hexes.set_crs("EPSG:4326")
    print(f"  {len(hexes)} hexes")

    print("Loading districts...")
    districts = gpd.read_file(str(DISTRICTS))
    if districts.crs is None:
        districts = districts.set_crs("EPSG:4326")
    print(f"  {len(districts)} districts")

    # 2. Spatial join: hex centroids → district polygons
    print("Spatial joining hexes to districts...")
    hex_points = hexes.copy()
    hex_points.geometry = hexes.geometry.centroid
    joined = gpd.sjoin(hex_points, districts[["ID", "NAME", "STATE", "HAZARD", "EXPOSURE", "VULNERABILITY", "RISK", "geometry"]],
                       how="left", predicate="within")
    joined = joined[~joined.index.duplicated(keep="first")]

    hexes["district_id"]   = joined["ID"].values
    hexes["district_name"] = joined["NAME"].values
    hexes["district_hazard"]       = joined["HAZARD"].values
    hexes["district_exposure"]     = joined["EXPOSURE"].values
    hexes["district_vulnerability"]= joined["VULNERABILITY"].values
    hexes["district_risk"]         = joined["RISK"].values

    matched = hexes["district_id"].notna().sum()
    print(f"  Matched {matched}/{len(hexes)} hexes to districts")

    # Fill unmatched hexes with nearest district's data (border hexes)
    if matched < len(hexes):
        median_h = hexes["district_hazard"].median()
        median_e = hexes["district_exposure"].median()
        median_v = hexes["district_vulnerability"].median()
        median_r = hexes["district_risk"].median()
        hexes["district_hazard"]        = hexes["district_hazard"].fillna(median_h)
        hexes["district_exposure"]      = hexes["district_exposure"].fillna(median_e)
        hexes["district_vulnerability"] = hexes["district_vulnerability"].fillna(median_v)
        hexes["district_risk"]          = hexes["district_risk"].fillna(median_r)
        hexes["district_id"]   = hexes["district_id"].fillna("unknown")
        hexes["district_name"] = hexes["district_name"].fillna("Unknown")

    # 3. Load real NFHS-5 WASH data
    print("Loading NFHS-5 WASH data...")
    wash_file = ROOT / "scripts/nfhs5_wash.json"
    mpi_file  = ROOT / "scripts/nfhs5_poverty_mpi.json"
    wash_raw  = json.loads(wash_file.read_text()) if wash_file.exists() else {}
    mpi_raw   = json.loads(mpi_file.read_text()) if mpi_file.exists() else {}

    wash_by_state, state_ac = build_wash_state_context(list(hexes["state"].unique()), wash_raw, mpi_raw)

    matched_wash = sum(1 for s in wash_by_state if s in [v for v in hexes["state"].unique()])
    print(f"  Matched WASH data for {matched_wash}/{len(hexes['state'].unique())} states")

    print("  Sample AC scores:")
    for s in ["Bihar", "Kerala", "Maharashtra", "Rajasthan", "Uttar Pradesh"]:
        if s in state_ac:
            w = wash_by_state[s]
            print(f"    {s}: AC={state_ac[s]} (toilet={w['toilet_pct']}%, water={w['piped_water_pct']}%, "
                  f"health={w['health_access_pct']}%, poverty={w['poverty_pct']}%)")

    # 3b. Load real per-hex soil sand % (ISRIC SoilGrids -- see fetch_soilgrids_sand.py).
    # compute_hex_risk() prefers this over its flat land-use-based guess when present.
    print("Loading real soil sand % (SoilGrids)...")
    if SOIL_SAND.exists():
        soil_map = json.loads(SOIL_SAND.read_text())
        hexes["real_sand_pct"] = hexes["h3_id"].map(soil_map)
        n_real = hexes["real_sand_pct"].notna().sum()
        print(f"  {n_real}/{len(hexes)} hexes have real soil data "
              f"({100*n_real/len(hexes):.1f}%) -- rest fall back to the land-use guess")
    else:
        print(f"  {SOIL_SAND.name} not found -- all hexes fall back to the land-use guess "
              f"(run scripts/fetch_soilgrids_sand.py first for real data)")
        hexes["real_sand_pct"] = None

    # 4. Estimate distance to coast (rough: hexes near sea level + near edges)
    print("Estimating coastal proximity...")
    centroids = hexes.geometry.centroid
    hex_lats = [c.y for c in centroids]
    hex_lons = [c.x for c in centroids]

    # 4. Compute per-hex risk: ALL 10 hazard types
    print("Computing per-hex risk scores (10 hazard channels)...")

    results: dict[str, list] = {c: [] for c in RISK_COLS}
    cascade_stats: dict[str, int] = {}  # rule_id → count

    for i, (_, row) in enumerate(hexes.iterrows()):
        hex_result = compute_hex_risk(row, hex_lats[i], hex_lons[i], wash_by_state, state_ac)
        for rule_id in hex_result.pop("_cascade_rule_ids"):
            cascade_stats[rule_id] = cascade_stats.get(rule_id, 0) + 1
        for col in RISK_COLS:
            results[col].append(hex_result[col])

    for col, vals in results.items():
        hexes[col] = vals

    # 5. Stats
    print("\nResults:")
    for col in RISK_COLS:
        if col == "cascade_actions":
            continue
        vals = hexes[col].dropna()
        try:
            print(f"  {col:22s}: {vals.min():.3f} – {vals.max():.3f}  (mean {vals.mean():.3f})")
        except (TypeError, ValueError):
            pass

    n_districts = hexes["district_id"].nunique()
    print(f"  Unique districts matched: {n_districts}")

    # Cascade stats
    total_cascades = sum(cascade_stats.values())
    hexes_with_cascades = sum(1 for v in results["cascade_count"] if v > 0)
    print(f"\n  WASH Cascade Rules:")
    print(f"    {hexes_with_cascades} hexes triggered at least one rule ({hexes_with_cascades*100//len(results['cascade_count'])}%)")
    for rule_id, count in sorted(cascade_stats.items(), key=lambda x: -x[1]):
        print(f"    {rule_id:30s}: {count:5d} hexes")

    # 5. Save
    print(f"\nSaving {HEX_FILE}...")
    # Convert to plain GeoJSON dict for compact output
    gj = json.loads(hexes.to_json())
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f, separators=(",", ":"))

    print(f"Done. {len(hexes)} hexes with district linkage + per-hex risk.")


if __name__ == "__main__":
    main()
