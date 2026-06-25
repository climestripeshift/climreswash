"""
Spatial-join hex grid to districts, inherit district-level indicators,
compute per-hex risk scores using formulas.py with real NFHS-5 WASH data.

Hierarchy: hex → district → state → country

Run: python scripts/join_hex_districts.py
"""
import json
import math
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np

# ── Groundwater integration weights (tunable) ─────────────────────────────────
GW_WEIGHT     = 0.5   # how much groundwater stress amplifies drought sensitivity
AC_GW_PENALTY = 0.2   # how much groundwater stress reduces adaptive capacity
GW_DEFAULT    = 0.1   # default stress for districts with no well data

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.cascades import evaluate_cascades
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

    # 3. Load real NFHS-5 WASH data
    print("Loading NFHS-5 WASH data...")
    wash_file = ROOT / "scripts/nfhs5_wash.json"
    mpi_file  = ROOT / "scripts/nfhs5_poverty_mpi.json"
    wash_raw  = json.loads(wash_file.read_text()) if wash_file.exists() else {}
    mpi_raw   = json.loads(mpi_file.read_text()) if mpi_file.exists() else {}

    # Map DHS state names → hex grid state names (fuzzy)
    wash_by_state: dict[str, dict] = {}
    for hex_state in hexes["state"].unique():
        if not hex_state or hex_state == "Unknown":
            continue
        hs_lower = hex_state.lower().replace("&", "and")
        for dhs_name, vals in wash_raw.items():
            ds_lower = dhs_name.lower().replace("&", "and").replace("..", "")
            if hs_lower == ds_lower or hs_lower in ds_lower or ds_lower in hs_lower:
                vals["poverty_pct"] = mpi_raw.get(hex_state, 20.0)
                wash_by_state[hex_state] = vals
                break
        if hex_state not in wash_by_state:
            wash_by_state[hex_state] = {
                "toilet_pct": 70, "piped_water_pct": 85, "health_access_pct": 80,
                "electricity_pct": 90, "female_literacy_pct": 70,
                "poverty_pct": mpi_raw.get(hex_state, 20.0),
            }

    matched_wash = sum(1 for s in wash_by_state if s in [v for v in hexes["state"].unique()])
    print(f"  Matched WASH data for {matched_wash}/{len(hexes['state'].unique())} states")

    # Compute adaptive capacity per state
    state_ac: dict[str, float] = {}
    for state_name, w in wash_by_state.items():
        ac = adaptive_capacity(
            toilet_pct=w.get("toilet_pct", 70),
            piped_water_pct=w.get("piped_water_pct", 85),
            health_access_pct=w.get("health_access_pct", 80),
            electricity_pct=w.get("electricity_pct", 90),
            poverty_pct=w.get("poverty_pct", 20),
            female_literacy_pct=w.get("female_literacy_pct", 70),
        )
        state_ac[state_name] = round(ac, 3)

    print("  Sample AC scores:")
    for s in ["Bihar", "Kerala", "Maharashtra", "Rajasthan", "Uttar Pradesh"]:
        if s in state_ac:
            w = wash_by_state[s]
            print(f"    {s}: AC={state_ac[s]} (toilet={w['toilet_pct']}%, water={w['piped_water_pct']}%, "
                  f"health={w['health_access_pct']}%, poverty={w['poverty_pct']}%)")

    # 4. Estimate distance to coast (rough: hexes near sea level + near edges)
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

    # 4. Compute per-hex risk: ALL 10 hazard types
    print("Computing per-hex risk scores (10 hazard channels)...")

    RISK_COLS = [
        "flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk",
        "landslide_risk", "coldwave_risk", "flashflood_risk", "sealevel_risk", "fire_risk",
        "hex_risk", "cascade_count", "cascade_actions",
    ]
    results: dict[str, list] = {c: [] for c in RISK_COLS}
    cascade_stats: dict[str, int] = {}  # rule_id → count

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
        # Use real slope/dist_water if available, else estimate
        slope     = float(row.get("slope_deg", 0) or 0) or estimate_slope(elev)
        dist_w    = float(row.get("dist_water_m", 0) or 0) or estimate_dist_water(lu, elev)
        dist_coast = estimate_coast_dist(lat, lon, elev)

        # Sensitivity
        fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
        hs = heat_sensitivity(tree_pct, built_pct, dist_w)

        # Real population-based exposure + district-level or state-level AC
        pop = int(row.get("population", 10000) or 10000)
        exposure_10 = exposure_score(max(1, pop), 9, 8, 25)
        state_name = str(row.get("state", "") or "")
        # Prefer district-level AC from NFHS-5 integration, fall back to state
        ac_base = float(row.get("adaptive_capacity", 0) or 0)
        if ac_base < 0.05:
            ac_base = state_ac.get(state_name, 0.7)
        # Groundwater penalty: depleted aquifer reduces effective AC
        gw_stress = float(row.get("gw_stress_score", GW_DEFAULT) or GW_DEFAULT)
        ac = max(0.1, ac_base * (1 - AC_GW_PENALTY * gw_stress))

        # ── Read likelihood values (from compute_likelihood.py) ──
        flood_lk   = float(row.get("flood_likelihood", 0.5) or 0.5)
        heat_lk    = float(row.get("heat_likelihood", 0.5) or 0.5)
        drought_lk = float(row.get("drought_likelihood", 0.5) or 0.5)
        wb_lk      = float(row.get("wet_bulb_likelihood", 0.5) or 0.5)
        cyc_lk     = float(row.get("cyclone_likelihood", 0) or 0)
        wind_lk    = float(row.get("high_wind_likelihood", 0.1) or 0.1)

        # ── 1. Pluvial flood: severity × likelihood ──
        flood_sev = pluvial_flood_score(50, sand_pct, built_pct, slope)
        flood_haz = flood_sev * flood_lk
        flood_r = compute_risk(flood_haz, exposure_10, fs, ac)

        # ── 2. Heatwave: severity × likelihood ──
        threshold = 30.0 if elev > 800 else (37.0 if dist_coast < 50000 else 40.0)
        heat_sev = heatwave_score(44, threshold, 3, built_pct, tree_pct, dist_w)
        heat_haz = heat_sev * heat_lk
        heat_r = compute_risk(heat_haz, exposure_10, hs, ac)

        # ── 3. Cyclone: severity × likelihood ──
        if dist_coast < 300000:
            cyc_sev = cyclone_score(
                wind_max_kmh=150, dist_track_km=dist_coast / 1000,
                rainfall_24h_mm=100, sand_pct=sand_pct, built_pct=built_pct,
                slope_deg=slope, dist_coast_m=dist_coast, elev_m=elev,
                bay_factor=1.3 if lon > 80 else 1.0,
            )
        else:
            cyc_sev = 0.0
        cyc_haz = cyc_sev * cyc_lk
        cyc_r = compute_risk(cyc_haz, exposure_10, fs, ac)

        # ── 4. Drought: severity × likelihood ──
        spi_proxy = (ndvi - 0.4) * 3
        if sand_pct > 50:
            spi_proxy -= 0.5
        drought_sev = drought_score(spi_proxy)
        drought_haz = drought_sev * drought_lk
        drought_sens_base = 0.5 + 0.3 * (1 - ndvi) + 0.2 * (sand_pct / 100)
        drought_sens = min(1.0, drought_sens_base * (1 + GW_WEIGHT * gw_stress))
        drought_r = compute_risk(drought_haz, exposure_10, drought_sens, ac)

        # ── 5. Wet bulb: severity × likelihood ──
        rh_proxy = min(95, 40 + ndvi * 40 + max(0, 20 - dist_coast / 10000))
        wb_sev = wet_bulb_score(38, rh_proxy)
        wb_haz = wb_sev * wb_lk
        wb_r = compute_risk(wb_haz, exposure_10, hs, ac)

        # ── 6. Landslide (steep + deforested + wet) ──
        if slope > 5:
            ls_haz = min(10.0, (slope / 3) * (1.2 - ndvi) * 3)
            ls_sens = 0.4 * (slope / 30) + 0.3 * (1 - ndvi) + 0.3 * math.exp(-dist_w / 2000)
            ls_r = compute_risk(ls_haz, exposure_10, ls_sens, ac)
        else:
            ls_r = 0.0

        # ── 7. Cold wave (northern plains + high altitude, winter) ──
        if lat > 22 or elev > 1500:
            cold_haz = min(10.0, max(0, (lat - 22) / 15 * 4 + elev / 2000 * 4))
            cold_sens = 0.4 * (1 - built_pct / 100) + 0.3 * min(1, elev / 3000) + 0.3 * max(0, (lat - 25) / 12)
            cw_r = compute_risk(cold_haz, exposure_10, cold_sens, ac)
        else:
            cw_r = 0.0

        # ── 8. Flash flood (steep terrain + monsoon) ──
        if slope > 3:
            ff_haz = min(10.0, slope / 4 * 5 * (0.5 + ndvi))
            ff_sens = 0.4 * (slope / 30) + 0.3 * math.exp(-dist_w / 1500) + 0.3 * (1 - sand_pct / 100)
            ff_r = compute_risk(ff_haz, exposure_10, ff_sens, ac)
        else:
            ff_r = 0.0

        # ── 9. Sea level rise (low-elevation coastal) ──
        if elev < 20 and dist_coast < 100000:
            slr_haz = min(10.0, max(0, (20 - elev) / 2) * math.exp(-dist_coast / 30000) * 3)
            slr_sens = 0.5 * max(0, 1 - elev / 20) + 0.3 * math.exp(-dist_coast / 20000) + 0.2
            slr_r = compute_risk(slr_haz, exposure_10, slr_sens, ac)
        else:
            slr_r = 0.0

        # ── 10. Forest fire (dry forest + scrubland) ──
        if lu in ("tree", "shrub", "grass") and ndvi < 0.6:
            fire_haz = min(10.0, (0.7 - ndvi) * 8 + (1 if lu == "shrub" else 0) * 2)
            fire_sens = 0.4 * (1 if lu in ("tree", "shrub") else 0.3) + 0.3 * (0.7 - ndvi) + 0.3 * (sand_pct / 100)
            fire_r = compute_risk(fire_haz, exposure_10, fire_sens, ac)
        else:
            fire_r = 0.0

        # Combined: max of all 10 hazard channels
        all_risks = [flood_r, heat_r, cyc_r, drought_r, wb_r, ls_r, cw_r, ff_r, slr_r, fire_r]
        combined = max(all_risks)

        # Evaluate WASH cascade rules
        cascade_props = {
            "flood_risk": flood_r, "heat_risk": heat_r, "cyclone_risk": cyc_r,
            "drought_risk": drought_r, "wetbulb_risk": wb_r, "landslide_risk": ls_r,
            "coldwave_risk": cw_r, "population": int(row.get("population", 0) or 0),
            "elevation_mean": elev, "built_pct": built_pct,
            **wash_by_state.get(state_name, {}),
        }
        cascades = evaluate_cascades(cascade_props)
        cascade_amp = sum(c.amplifier for c in cascades)
        combined = min(10.0, combined + cascade_amp)
        cascade_action_str = " | ".join(f"[{c.severity.upper()}] {c.action}" for c in cascades) if cascades else ""
        for c in cascades:
            cascade_stats[c.rule_id] = cascade_stats.get(c.rule_id, 0) + 1

        results["flood_risk"].append(round(flood_r, 2))
        results["heat_risk"].append(round(heat_r, 2))
        results["cyclone_risk"].append(round(cyc_r, 2))
        results["drought_risk"].append(round(drought_r, 2))
        results["wetbulb_risk"].append(round(wb_r, 2))
        results["landslide_risk"].append(round(ls_r, 2))
        results["coldwave_risk"].append(round(cw_r, 2))
        results["flashflood_risk"].append(round(ff_r, 2))
        results["sealevel_risk"].append(round(slr_r, 2))
        results["fire_risk"].append(round(fire_r, 2))
        results["hex_risk"].append(round(combined, 2))
        results["cascade_count"].append(len(cascades))
        results["cascade_actions"].append(cascade_action_str)

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
