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
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import (
    adaptive_capacity,
    compute_risk,
    cyclone_score,
    drought_score,
    exposure_score,
    flood_sensitivity,
    heat_sensitivity,
    heatwave_score,
    pluvial_flood_score,
    wet_bulb_score,
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

    # 3. Estimate distance to coast (rough: hexes near sea level + near edges)
    print("Estimating coastal proximity...")
    centroids = hexes.geometry.centroid
    hex_lats = [c.y for c in centroids]
    hex_lons = [c.x for c in centroids]

    def estimate_coast_dist(lat: float, lon: float, elev: float) -> float:
        """Rough coastal distance in metres from geography."""
        coastal_proximity = 1e6  # default: far inland
        # West coast (Konkan, Malabar, Gujarat)
        if lon < 74 and lat < 22:
            coastal_proximity = max(5000, (lon - 68) * 111000)
        elif lon < 74 and lat < 16:
            coastal_proximity = max(5000, (lon - 73) * 111000)
        # East coast (Coromandel, Odisha, Bengal)
        if lat < 20 and lon > 80:
            coastal_proximity = min(coastal_proximity, max(5000, (85 - lon) * 111000))
        if lat < 22 and lon > 86:
            coastal_proximity = min(coastal_proximity, max(5000, (89 - lon) * 111000))
        # Very low elevation = likely near coast
        if elev < 10:
            coastal_proximity = min(coastal_proximity, 10000)
        elif elev < 30:
            coastal_proximity = min(coastal_proximity, 50000)
        return coastal_proximity

    # 4. Compute per-hex risk: ALL 5 hazard types
    print("Computing per-hex risk scores (flood + heat + cyclone + drought + wet-bulb)...")

    results: dict[str, list] = {
        "flood_sensitivity": [], "heat_sensitivity": [],
        "flood_risk": [], "heat_risk": [], "cyclone_risk": [],
        "drought_risk": [], "wetbulb_risk": [], "hex_risk": [],
    }

    for i, (_, row) in enumerate(hexes.iterrows()):
        elev = float(row.get("elevation_mean", 200) or 200)
        lu   = str(row.get("land_use", "crop") or "crop")
        ndvi = float(row.get("ndvi_mean", 0.3) or 0.3)
        lat  = hex_lats[i]
        lon  = hex_lons[i]

        params    = LAND_USE_PARAMS.get(lu, DEFAULT_PARAMS)
        tree_pct  = max(params["tree_pct"], ndvi * 100 * 0.8)
        built_pct = params["built_pct"]
        sand_pct  = params["sand_pct"]
        slope     = estimate_slope(elev)
        dist_w    = estimate_dist_water(lu, elev)
        dist_coast = estimate_coast_dist(lat, lon, elev)

        # Sensitivity
        fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
        hs = heat_sensitivity(tree_pct, built_pct, dist_w)

        # District-level inputs
        d_hazard = float(row.get("district_hazard", 0.25) or 0.25)
        d_exposure = float(row.get("district_exposure", 0.4) or 0.4)
        d_vuln = float(row.get("district_vulnerability", 0.5) or 0.5)
        exposure_10 = d_exposure * 10
        ac = max(0.1, 1 - d_vuln)

        # ── Hazard 1: Pluvial flood (assume 50mm monsoon rain) ──
        flood_haz = pluvial_flood_score(50, sand_pct, built_pct, slope)
        flood_r = compute_risk(flood_haz, exposure_10, fs, ac)

        # ── Hazard 2: Heatwave (assume 44°C day 3, plains threshold) ──
        threshold = 30.0 if elev > 800 else (37.0 if dist_coast < 50000 else 40.0)
        heat_haz = heatwave_score(44, threshold, 3, built_pct, tree_pct, dist_w)
        heat_r = compute_risk(heat_haz, exposure_10, hs, ac)

        # ── Hazard 3: Cyclone (coastal hexes, assume cat-3 storm) ──
        if dist_coast < 300000:  # within 300km of coast
            cyc_haz = cyclone_score(
                wind_max_kmh=150, dist_track_km=dist_coast / 1000,
                rainfall_24h_mm=100, sand_pct=sand_pct, built_pct=built_pct,
                slope_deg=slope, dist_coast_m=dist_coast, elev_m=elev,
                bay_factor=1.3 if lon > 80 else 1.0  # Bay of Bengal funnel
            )
        else:
            cyc_haz = 0.0
        cyc_r = compute_risk(cyc_haz, exposure_10, fs, ac)

        # ── Hazard 4: Drought (arid/semi-arid regions) ──
        # Low NDVI + low rainfall zones → negative SPI proxy
        spi_proxy = (ndvi - 0.4) * 3  # ndvi 0.1 → SPI -0.9, ndvi 0.6 → SPI +0.6
        if sand_pct > 50:
            spi_proxy -= 0.5  # sandy regions more drought-prone
        drought_haz = drought_score(spi_proxy)
        drought_sens = 0.5 + 0.3 * (1 - ndvi) + 0.2 * (sand_pct / 100)
        drought_r = compute_risk(drought_haz, exposure_10, drought_sens, ac)

        # ── Hazard 5: Wet bulb (humid heat — coastal + riverine) ──
        # Estimate RH from NDVI + coast: high NDVI + near water = humid
        rh_proxy = 40 + ndvi * 40 + max(0, 20 - dist_coast / 10000)
        rh_proxy = min(95, rh_proxy)
        wb_haz = wet_bulb_score(38, rh_proxy)  # 38°C with estimated humidity
        wb_r = compute_risk(wb_haz, exposure_10, hs, ac)

        # Combined: max of all 5 hazard channels
        combined = max(flood_r, heat_r, cyc_r, drought_r, wb_r)

        results["flood_sensitivity"].append(round(fs, 3))
        results["heat_sensitivity"].append(round(hs, 3))
        results["flood_risk"].append(round(flood_r, 2))
        results["heat_risk"].append(round(heat_r, 2))
        results["cyclone_risk"].append(round(cyc_r, 2))
        results["drought_risk"].append(round(drought_r, 2))
        results["wetbulb_risk"].append(round(wb_r, 2))
        results["hex_risk"].append(round(combined, 2))

    for col, vals in results.items():
        hexes[col] = vals

    # 5. Stats
    print("\nResults:")
    for col in ["flood_sensitivity", "heat_sensitivity", "flood_risk", "heat_risk",
                 "cyclone_risk", "drought_risk", "wetbulb_risk", "hex_risk"]:
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
