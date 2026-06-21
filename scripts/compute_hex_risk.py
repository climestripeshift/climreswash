"""
Enrich hex grid with risk scores computed from formulas.py.
Derives terrain parameters from existing properties (elevation, NDVI, land_use),
then computes flood/heat sensitivity and scenario-based hazard scores.

Run: python scripts/compute_hex_risk.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import (
    flood_sensitivity,
    heat_sensitivity,
    heatwave_score,
    pluvial_flood_score,
)

ROOT     = Path(__file__).resolve().parent.parent
HEX_FILE = ROOT / "client/public/data/india_hex_grid.geojson"

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


def estimate_slope(elevation_m: float) -> float:
    """Rough slope from elevation band (no DEM neighbors available)."""
    if elevation_m > 3000: return 25.0
    if elevation_m > 1500: return 15.0
    if elevation_m > 800:  return 8.0
    if elevation_m > 300:  return 3.0
    if elevation_m > 100:  return 1.0
    return 0.5


def estimate_dist_water(land_use: str, elevation_m: float) -> float:
    """Rough distance-to-water estimate in metres."""
    if land_use in ("water", "wetland", "mangrove"):
        return 100.0
    if elevation_m < 30:
        return 500.0
    if elevation_m < 100:
        return 1500.0
    if elevation_m < 300:
        return 3000.0
    return 5000.0


def main():
    print(f"Loading {HEX_FILE}...")
    with open(HEX_FILE) as f:
        gj = json.load(f)

    features = gj["features"]
    print(f"  {len(features)} hexes")

    print("Computing risk scores per hex...")
    for feat in features:
        p = feat["properties"]
        elev      = p.get("elevation_mean", 200)
        ndvi      = p.get("ndvi_mean", 0.3)
        land_use  = p.get("land_use", "crop")

        params    = LAND_USE_PARAMS.get(land_use, DEFAULT_PARAMS)
        tree_pct  = params["tree_pct"]
        built_pct = params["built_pct"]
        sand_pct  = params["sand_pct"]
        slope     = estimate_slope(elev)
        dist_w    = estimate_dist_water(land_use, elev)

        # Adjust tree_pct with NDVI (high NDVI = more actual green cover)
        tree_pct = max(tree_pct, ndvi * 100 * 0.8)

        # Sensitivity scores (0–1)
        fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
        hs = heat_sensitivity(tree_pct, built_pct, dist_w)

        # Scenario: pluvial flood with 50mm rainfall (IMD "heavy rain")
        flood_50 = pluvial_flood_score(50, sand_pct, built_pct, slope)

        # Scenario: heatwave day 3 at 44°C (plains threshold 40°C)
        heat_44 = heatwave_score(44, 40, 3, built_pct, tree_pct, dist_w)

        p["flood_sensitivity"]  = round(fs, 3)
        p["heat_sensitivity"]   = round(hs, 3)
        p["flood_risk_50mm"]    = round(flood_50, 2)
        p["heat_risk_44c"]      = round(heat_44, 2)

    # Stats
    for key in ["flood_sensitivity", "heat_sensitivity", "flood_risk_50mm", "heat_risk_44c"]:
        vals = [f["properties"][key] for f in features]
        print(f"  {key:22s}: {min(vals):.3f} – {max(vals):.3f}  (mean {sum(vals)/len(vals):.3f})")

    print(f"Saving {HEX_FILE}...")
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f, separators=(",", ":"))

    print("Done.")


if __name__ == "__main__":
    main()
