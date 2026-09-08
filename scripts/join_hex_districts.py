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
HEX_PROPS    = ROOT / "client/public/data/india_hex_props.json"


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

    # 3c. Load real per-hex slope + distance-to-water (compute_slope_water.py --
    # WIRING FIX, see chat: that script only ever wrote india_hex_props.json,
    # while this script reads hexes exclusively from india_hex_grid.geojson, so
    # its real slope_deg/dist_water_m never reached compute_hex_risk() -- every
    # hex nationwide was silently using the coarse elevation-bucket estimate
    # (capped at 25 deg) regardless of whether compute_slope_water.py had been
    # run. Merged here the same way real_sand_pct is above: by h3_id, from
    # india_hex_props.json (the one file that script writes to), not by
    # re-deriving it from the geojson.
    # Also loads dist_to_river_km here -- SAME wiring gap, found while verifying Bug 6
    # (see chat): fetch_river_distance.py only ever wrote india_hex_props.json too, and
    # was never merged in here either, so Bug 6's real river-distance signal was
    # silently falling back to a 999km sentinel for every hex nationwide -- the actual
    # national run never had real river data despite sample verification (which
    # manually injected the field) passing clean.
    print("Loading real slope + distance-to-water (compute_slope_water.py) + "
          "distance-to-river (fetch_river_distance.py)...")
    if HEX_PROPS.exists():
        props_raw = json.loads(HEX_PROPS.read_text())
        slope_map = {p["h3_id"]: p.get("slope_deg") for p in props_raw if p.get("slope_deg") is not None}
        distw_map = {p["h3_id"]: p.get("dist_water_m") for p in props_raw if p.get("dist_water_m") is not None}
        distriver_map = {p["h3_id"]: p.get("dist_to_river_km") for p in props_raw if p.get("dist_to_river_km") is not None}
        hexes["slope_deg"] = hexes["h3_id"].map(slope_map)
        hexes["dist_water_m"] = hexes["h3_id"].map(distw_map)
        hexes["dist_to_river_km"] = hexes["h3_id"].map(distriver_map)
        n_real_slope = hexes["slope_deg"].notna().sum()
        n_real_river = hexes["dist_to_river_km"].notna().sum()
        print(f"  {n_real_slope}/{len(hexes)} hexes have real slope/dist-water data "
              f"({100*n_real_slope/len(hexes):.1f}%) -- rest fall back to the elevation-bucket estimate")
        print(f"  {n_real_river}/{len(hexes)} hexes have real dist_to_river_km "
              f"({100*n_real_river/len(hexes):.1f}%) -- rest fall back to the dist_water_m-only comparison")
    else:
        print(f"  {HEX_PROPS.name} not found -- all hexes fall back to the elevation-bucket estimate "
              f"(run scripts/compute_slope_water.py first for real data)")
        hexes["slope_deg"] = None
        hexes["dist_water_m"] = None
        hexes["dist_to_river_km"] = None

    # 4. Estimate distance to coast (rough: hexes near sea level + near edges)
    print("Estimating coastal proximity...")
    centroids = hexes.geometry.centroid
    hex_lats = [c.y for c in centroids]
    hex_lons = [c.x for c in centroids]

    # 4b. SCOPED REVERT for dist_water_m near the coast (see chat). Root cause:
    # the hex grid (build_hex_grid.py) is generated only within India's LAND
    # district-polygon union -- no hex was ever created over open ocean, so
    # "nearest water hex" can never find the sea, only inland lakes/rivers/
    # reservoirs. Confirmed systemic on 6 real coastal cities (Chennai, Vizag,
    # Mumbai, Kochi, Puri, Paradip): all showed dist_water_m of 18-54km against
    # a true ocean distance of 0-3km.
    #
    # NOT a blanket revert: checked genuinely inland hexes first (Bhopal,
    # Indore, Nagpur, Gwalior, Bikaner, Amravati, Sagar) -- the OLD heuristic
    # (a flat elevation-bucket guess, capped at 5000m everywhere, everywhere)
    # differs from the real value by 10-100x there too, but the REAL value is
    # the credible one (Bikaner/Thar desert: old=3.2km flat guess, new=340km,
    # and 340km is right -- it's a real desert). Blanket-reverting would have
    # thrown away a genuine improvement for arid/interior India to fix a
    # coastal-only problem.
    #
    # Scope: only override dist_water_m where estimate_coast_dist() recognizes
    # the hex as being inside a coastal geographic zone at all (it returns the
    # literal sentinel 1e6 for "no coastal formula applies," so this is a
    # clean binary gate, not a fuzzy threshold). Known limitation carried over
    # from that function: its low-elevation override can false-positive on the
    # genuinely-inland-but-flat Gangetic plain -- an acceptable failure mode
    # here specifically, since it only means those hexes ALSO get the old
    # (already-mediocre-everywhere) heuristic rather than the real-but-untested
    # inland value, not a new error.
    print("Reverting dist_water_m to the old heuristic for coastal-zone hexes only...")
    from risk.hex_risk import estimate_coast_dist, estimate_dist_water
    n_reverted = 0
    dist_water_col = hexes["dist_water_m"].tolist()
    for i, row in enumerate(hexes.itertuples()):
        elev = float(getattr(row, "elevation_mean", 200) or 200)
        cd = estimate_coast_dist(hex_lats[i], hex_lons[i], elev)
        if cd < 1e6:
            lu = str(getattr(row, "land_use", "crop") or "crop")
            dist_water_col[i] = estimate_dist_water(lu, elev)
            n_reverted += 1
    hexes["dist_water_m"] = dist_water_col
    print(f"  {n_reverted}/{len(hexes)} hexes reverted to the old dist_water_m heuristic "
          f"(coastal zone) -- slope_deg and inland dist_water_m are unaffected")

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
