"""
Spatial-join hex grid to districts, inherit district-level indicators,
compute per-hex risk scores using formulas.py.

Hierarchy: hex → district → state → country

Run: python scripts/join_hex_districts.py
"""
import json
import math
import sys
from pathlib import Path

import geopandas as gpd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import (
    adaptive_capacity,
    compute_risk,
    exposure_score,
    flood_sensitivity,
    heat_sensitivity,
    heatwave_score,
    pluvial_flood_score,
)

ROOT         = Path(__file__).resolve().parent.parent
HEX_FILE     = ROOT / "client/public/data/india_hex_grid.geojson"
DISTRICTS    = ROOT / "client/public/data/india.json"

# ── Derive terrain parameters from land_use class ────────────────────────────

LAND_USE_PARAMS: dict[str, dict[str, float]] = {
    "tree":     {"tree_pct": 75, "built_pct": 2,  "sand_pct": 20},
    "shrub":    {"tree_pct": 30, "built_pct": 3,  "sand_pct": 35},
    "grass":    {"tree_pct": 10, "built_pct": 5,  "sand_pct": 30},
    "crop":     {"tree_pct": 8,  "built_pct": 10, "sand_pct": 25},
    "built":    {"tree_pct": 5,  "built_pct": 70, "sand_pct": 15},
    "barren":   {"tree_pct": 1,  "built_pct": 2,  "sand_pct": 75},
    "water":    {"tree_pct": 0,  "built_pct": 0,  "sand_pct": 10},
    "wetland":  {"tree_pct": 15, "built_pct": 2,  "sand_pct": 10},
    "snow":     {"tree_pct": 0,  "built_pct": 0,  "sand_pct": 5},
    "mangrove": {"tree_pct": 60, "built_pct": 0,  "sand_pct": 15},
}
DEFAULT_PARAMS = {"tree_pct": 10, "built_pct": 10, "sand_pct": 30}


def estimate_slope(elev: float) -> float:
    if elev > 3000: return 25.0
    if elev > 1500: return 15.0
    if elev > 800:  return 8.0
    if elev > 300:  return 3.0
    if elev > 100:  return 1.0
    return 0.5


def estimate_dist_water(lu: str, elev: float) -> float:
    if lu in ("water", "wetland", "mangrove"): return 100.0
    if elev < 30:  return 500.0
    if elev < 100: return 1500.0
    if elev < 300: return 3000.0
    return 5000.0


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

    # 3. Compute per-hex risk using terrain + district data
    print("Computing per-hex risk scores...")

    flood_sens_list = []
    heat_sens_list  = []
    hex_risk_list   = []

    for _, row in hexes.iterrows():
        elev = row.get("elevation_mean", 200) or 200
        lu   = row.get("land_use", "crop") or "crop"
        ndvi = row.get("ndvi_mean", 0.3) or 0.3

        params    = LAND_USE_PARAMS.get(lu, DEFAULT_PARAMS)
        tree_pct  = max(params["tree_pct"], ndvi * 100 * 0.8)
        built_pct = params["built_pct"]
        sand_pct  = params["sand_pct"]
        slope     = estimate_slope(elev)
        dist_w    = estimate_dist_water(lu, elev)

        # Terrain-based sensitivity
        fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
        hs = heat_sensitivity(tree_pct, built_pct, dist_w)

        # District-level hazard and exposure (from GeoJSON)
        d_hazard = float(row.get("district_hazard", 0.25) or 0.25)
        d_vuln   = float(row.get("district_vulnerability", 0.5) or 0.5)

        # Combine: district hazard × hex sensitivity → localized risk
        # Scale hazard from 0-1 to 0-10, vulnerability as AC inverse
        hazard_10 = d_hazard * 10
        exposure_10 = float(row.get("district_exposure", 0.4) or 0.4) * 10
        ac = 1 - d_vuln  # high vulnerability = low adaptive capacity

        # Flood risk for this hex
        flood_risk = compute_risk(
            hazard_score=hazard_10,
            exposure=exposure_10,
            sensitivity=fs,
            ac=max(0.1, ac),
        )

        # Heat risk for this hex
        heat_risk = compute_risk(
            hazard_score=hazard_10,
            exposure=exposure_10,
            sensitivity=hs,
            ac=max(0.1, ac),
        )

        # Combined risk (max of flood and heat, as different hazards)
        combined = max(flood_risk, heat_risk)

        flood_sens_list.append(round(fs, 3))
        heat_sens_list.append(round(hs, 3))
        hex_risk_list.append(round(combined, 2))

    hexes["flood_sensitivity"] = flood_sens_list
    hexes["heat_sensitivity"]  = heat_sens_list
    hexes["hex_risk"]          = hex_risk_list

    # 4. Stats
    print("\nResults:")
    for col in ["flood_sensitivity", "heat_sensitivity", "hex_risk"]:
        vals = hexes[col].dropna()
        print(f"  {col:22s}: {vals.min():.3f} – {vals.max():.3f}  (mean {vals.mean():.3f})")

    # District match stats
    n_districts = hexes["district_id"].nunique()
    print(f"  Unique districts matched: {n_districts}")

    # 5. Save
    print(f"\nSaving {HEX_FILE}...")
    # Convert to plain GeoJSON dict for compact output
    gj = json.loads(hexes.to_json())
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f, separators=(",", ":"))

    print(f"Done. {len(hexes)} hexes with district linkage + per-hex risk.")


if __name__ == "__main__":
    main()
