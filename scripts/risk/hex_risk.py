"""
Per-hex risk computation, shared by join_hex_districts.py (full rebuild) and
any narrow patch script that needs to recompute a subset of hexes (e.g. after
a groundwater/AC-input correction) without duplicating formula logic.

`row` may be a pandas Series (from the geopandas hex GeoDataFrame) or a plain
dict (from india_hex_props.json) — everything here uses .get(), so either works.
"""
import math
import random

from .cascades import evaluate_cascades
from .formulas import (
    adaptive_capacity,
    air_pollution_score,
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

# ── Groundwater integration weights (tunable) ─────────────────────────────────
GW_WEIGHT     = 0.5   # how much groundwater stress amplifies drought sensitivity
AC_GW_PENALTY = 0.2   # how much groundwater stress reduces adaptive capacity
GW_DEFAULT    = 0.1   # default stress for districts with no well data

# ── Duration-aware hazard config (tunable) ─────────────────────────────────────
OCCURRENCE_REF = {
    "flood": 3.0, "extreme_rain": 1.5, "heat": 10.0, "severe_heat": 2.0,
    "drought": 0.15, "high_wind": 0.02, "wet_bulb": 5.0,
}
DURATION_REF = {"heat": 90.0, "drought": 0.5, "wet_bulb": 60.0}
CHRONIC_HAZARDS = {"heat", "drought", "wet_bulb"}
CHRONIC_WEIGHT = 0.5
WASH_RELEVANCE = {
    "flood": 1.0, "extreme_rain": 0.8, "heat": 0.7, "severe_heat": 0.8,
    "drought": 1.0, "high_wind": 0.5, "wet_bulb": 0.6,
}

# ── Hazard-specific AC effectiveness (tunable) ────────────────────────────────
AC_EFFECTIVENESS = {
    "flood": 1.0, "drought": 0.8, "cyclone": 0.7, "heat": 0.4, "wet_bulb": 0.4,
    "landslide": 0.5, "coldwave": 0.6, "flashflood": 0.8, "sealevel": 0.6,
    "fire": 0.3, "air_pollution": 0.2,
}

HP_WEIGHT = 0.2  # heat-pollution compound amplifier weight

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

RISK_COLS = [
    "flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk",
    "landslide_risk", "coldwave_risk", "flashflood_risk", "sealevel_risk", "fire_risk",
    "hex_risk", "pollution_risk", "pm25_annual", "wash_disruption_days",
    "total_burden_days", "single_hazard_days", "multi_hazard_days",
    "weighted_burden", "weighted_burden_children", "weighted_burden_elderly",
    "heat_chronic_factor", "drought_chronic_factor", "wetbulb_chronic_factor",
    "cascade_count", "cascade_actions",
]


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


def estimate_coast_dist(lat: float, lon: float, elev: float) -> float:
    """Rough coastal distance in metres from geography."""
    coastal_proximity = 1e6  # default: far inland
    if lon < 74 and lat < 22:
        coastal_proximity = max(5000, (lon - 68) * 111000)
    elif lon < 74 and lat < 16:
        coastal_proximity = max(5000, (lon - 73) * 111000)
    if lat < 20 and lon > 80:
        coastal_proximity = min(coastal_proximity, max(5000, (85 - lon) * 111000))
    if lat < 22 and lon > 86:
        coastal_proximity = min(coastal_proximity, max(5000, (89 - lon) * 111000))
    if elev < 10:
        coastal_proximity = min(coastal_proximity, 10000)
    elif elev < 30:
        coastal_proximity = min(coastal_proximity, 50000)
    return coastal_proximity


def build_wash_state_context(states: list[str], wash_raw: dict, mpi_raw: dict) -> tuple[dict, dict]:
    """Reconstruct wash_by_state + state_ac from the same static NFHS-5 sources
    join_hex_districts.py uses — needs only the set of hex states, not geometry."""
    wash_by_state: dict[str, dict] = {}
    for hex_state in states:
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

    return wash_by_state, state_ac


def _occ_and_chronic(hz_name: str, days: float, severity: float):
    occ_ref = OCCURRENCE_REF.get(hz_name, 5.0)
    occurrence = min(1.0, days / occ_ref) if occ_ref > 0 else 0.0
    hazard = severity * occurrence
    if hz_name in CHRONIC_HAZARDS:
        dur_ref = DURATION_REF.get(hz_name, 60.0)
        duration = min(1.0, days / dur_ref) if dur_ref > 0 else 0.0
        chronic_factor = 1.0 + CHRONIC_WEIGHT * duration
    else:
        chronic_factor = 1.0
    return occurrence, chronic_factor, hazard * chronic_factor


def compute_hex_risk(row, lat: float, lon: float, wash_by_state: dict, state_ac: dict) -> dict:
    """Compute all RISK_COLS fields for one hex. Returns {col: value} plus
    an internal '_cascade_rule_ids' list for caller-side stats tracking."""
    elev = float(row.get("elevation_mean", 200) or 200)
    lu   = str(row.get("land_use", "crop") or "crop")
    ndvi = float(row.get("ndvi_mean", 0.3) or 0.3)

    params    = LAND_USE_PARAMS.get(lu, DEFAULT_PARAMS)
    tree_pct  = max(params["tree_pct"], ndvi * 100 * 0.8)
    built_pct = params["built_pct"]
    # Real per-hex soil sand % (ISRIC SoilGrids, see fetch_soilgrids_sand.py) takes
    # priority over the flat land-use lookup -- every "crop" hex used to get an
    # identical 25% regardless of whether it's Thar desert sand or Gangetic clay.
    # Falls back to the land-use guess for any hex SoilGrids didn't cover (e.g. a
    # water-only pixel at the sampled point).
    real_sand = row.get("real_sand_pct")
    sand_pct  = float(real_sand) if real_sand is not None else params["sand_pct"]
    slope     = float(row.get("slope_deg", 0) or 0) or estimate_slope(elev)
    dist_w    = float(row.get("dist_water_m", 0) or 0) or estimate_dist_water(lu, elev)
    dist_coast = estimate_coast_dist(lat, lon, elev)

    fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
    hs = heat_sensitivity(tree_pct, built_pct, dist_w)

    pop = int(row.get("population", 10000) or 10000)
    exposure_10 = exposure_score(max(1, pop), 9, 8, 25)
    state_name = str(row.get("state", "") or "")
    ac_base = float(row.get("adaptive_capacity", 0) or 0)
    if ac_base < 0.05:
        ac_base = state_ac.get(state_name, 0.7)
    gw_stress = float(row.get("gw_stress_score", GW_DEFAULT) or GW_DEFAULT)
    ac = max(0.1, ac_base * (1 - AC_GW_PENALTY * gw_stress))

    flood_days   = float(row.get("flood_days_per_year", 0) or 0)
    heat_days    = float(row.get("heat_days_per_year", 0) or 0)
    drought_days = float(row.get("drought_days_per_year", 0) or 0)
    wb_days      = float(row.get("wet_bulb_days_per_year", 0) or 0)
    cyc_lk       = float(row.get("cyclone_likelihood", 0) or 0)

    # ── 1. Pluvial flood ──
    flood_sev = pluvial_flood_score(50, sand_pct, built_pct, slope)
    flood_occ, flood_cf, flood_haz = _occ_and_chronic("flood", flood_days, flood_sev)
    flood_r = compute_risk(flood_haz, exposure_10, fs, ac * AC_EFFECTIVENESS["flood"])

    # ── 2. Heatwave ──
    threshold = 30.0 if elev > 800 else (37.0 if dist_coast < 50000 else 40.0)
    heat_sev = heatwave_score(44, threshold, 3, built_pct, tree_pct, dist_w)
    heat_occ, heat_cf, heat_haz = _occ_and_chronic("heat", heat_days, heat_sev)
    heat_r = compute_risk(heat_haz, exposure_10, hs, ac * AC_EFFECTIVENESS["heat"])

    # ── 3. Cyclone ──
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
    cyc_r = compute_risk(cyc_haz, exposure_10, fs, ac * AC_EFFECTIVENESS["cyclone"])

    # ── 4. Drought ──
    spi_proxy = (ndvi - 0.4) * 3
    if sand_pct > 50:
        spi_proxy -= 0.5
    drought_sev_ndvi = drought_score(spi_proxy)
    drought_freq_val = min(1.0, max(0.0, drought_days / 365.0)) if drought_days > 0 else 0.0
    drought_sev_freq = min(10.0, drought_freq_val * 15.0)
    drought_sev = max(drought_sev_ndvi, drought_sev_freq)
    drought_occ, drought_cf, drought_haz = _occ_and_chronic("drought", drought_days, drought_sev)
    drought_sens_base = 0.5 + 0.3 * (1 - ndvi) + 0.2 * (sand_pct / 100)
    drought_sens = min(1.0, drought_sens_base * (1 + GW_WEIGHT * gw_stress))
    drought_r = compute_risk(drought_haz, exposure_10, drought_sens, ac * AC_EFFECTIVENESS["drought"])

    # ── 5. Wet bulb ──
    rh_proxy = min(95, 40 + ndvi * 40 + max(0, 20 - dist_coast / 10000))
    wb_sev = wet_bulb_score(38, rh_proxy)
    wb_occ, wb_cf, wb_haz = _occ_and_chronic("wet_bulb", wb_days, wb_sev)
    wb_r = compute_risk(wb_haz, exposure_10, hs, ac * AC_EFFECTIVENESS["wet_bulb"])

    # ── 5b. Air pollution ──
    pm25 = float(row.get("pm25_annual", 0) or 0)
    if pm25 <= 0:
        if 76 < lon < 86 and 24 < lat < 30:
            pm25 = 60 + (30 - lat) * 5 + random.uniform(-10, 10)
        elif 76 < lon < 78 and 28 < lat < 29:
            pm25 = 90 + random.uniform(-10, 15)
        elif lon < 74 and lat > 22:
            pm25 = 35 + random.uniform(-5, 10)
        elif lon > 88 and lat > 22:
            pm25 = 15 + random.uniform(-3, 5)
        elif lat < 15:
            pm25 = 20 + random.uniform(-5, 5)
        else:
            pm25 = 30 + random.uniform(-10, 10)
        pm25 = max(5, pm25)

    pollution_haz = air_pollution_score(pm25)

    heat_pollution_compound = HP_WEIGHT * min(heat_haz, pollution_haz) / 10
    heat_haz_adjusted = min(10.0, heat_haz * (1 + heat_pollution_compound))
    heat_r = compute_risk(heat_haz_adjusted, exposure_10, hs, ac * AC_EFFECTIVENESS["heat"])

    pollution_r = compute_risk(pollution_haz, exposure_10, 0.5, ac * AC_EFFECTIVENESS["air_pollution"])

    wash_disruption = 0.0
    for hz_name, hz_days, hz_haz in [
        ("flood", flood_days, flood_haz), ("heat", heat_days, heat_haz),
        ("drought", drought_days, drought_haz), ("wet_bulb", wb_days, wb_haz),
    ]:
        sev_frac = min(1.0, hz_haz / 10) if hz_haz > 0 else 0.0
        wash_disruption += hz_days * sev_frac * WASH_RELEVANCE.get(hz_name, 0.5)
    wash_disruption = round(wash_disruption, 1)

    # ── 6. Landslide ──
    if slope > 5:
        ls_haz = min(10.0, (slope / 3) * (1.2 - ndvi) * 3)
        ls_sens = 0.4 * (slope / 30) + 0.3 * (1 - ndvi) + 0.3 * math.exp(-dist_w / 2000)
        ls_r = compute_risk(ls_haz, exposure_10, ls_sens, ac)
    else:
        ls_r = 0.0

    # ── 7. Cold wave ──
    if lat > 22 or elev > 1500:
        cold_haz = min(10.0, max(0, (lat - 22) / 15 * 4 + elev / 2000 * 4))
        cold_sens = 0.4 * (1 - built_pct / 100) + 0.3 * min(1, elev / 3000) + 0.3 * max(0, (lat - 25) / 12)
        cw_r = compute_risk(cold_haz, exposure_10, cold_sens, ac)
    else:
        cw_r = 0.0

    # ── 8. Flash flood ──
    if slope > 3:
        ff_haz = min(10.0, slope / 4 * 5 * (0.5 + ndvi))
        ff_sens = 0.4 * (slope / 30) + 0.3 * math.exp(-dist_w / 1500) + 0.3 * (1 - sand_pct / 100)
        ff_r = compute_risk(ff_haz, exposure_10, ff_sens, ac)
    else:
        ff_r = 0.0

    # ── 9. Sea level rise / coastal storm surge ──
    if elev < 20 and dist_coast < 100000:
        slr_haz = min(10.0, max(0, (20 - elev) / 2) * math.exp(-dist_coast / 30000) * 3)
        slr_sens = 0.5 * max(0, 1 - elev / 20) + 0.3 * math.exp(-dist_coast / 20000) + 0.2
        slr_r = compute_risk(slr_haz, exposure_10, slr_sens, ac)
        cyc_r = max(cyc_r, slr_r)
    else:
        slr_r = 0.0

    # ── 10. Forest fire ──
    if lu in ("tree", "shrub", "grass") and ndvi < 0.6:
        fire_haz = min(10.0, (0.7 - ndvi) * 8 + (1 if lu == "shrub" else 0) * 2)
        fire_sens = 0.4 * (1 if lu in ("tree", "shrub") else 0.3) + 0.3 * (0.7 - ndvi) + 0.3 * (sand_pct / 100)
        fire_r = compute_risk(fire_haz, exposure_10, fire_sens, ac)
    else:
        fire_r = 0.0

    # ── Cumulative burden days ──
    burden_hz_days = {
        "heat": heat_days,
        "flood": flood_days,
        "drought": max(0, drought_days * 30),
        "wet_bulb": wb_days,
        "pollution": max(0, (pm25 - 25) / 75 * 120) if pm25 > 25 else 0,
    }
    p = {h: min(0.99, d / 365) for h, d in burden_hz_days.items() if d > 0}
    if p:
        p_clear = 1.0
        for pv in p.values():
            p_clear *= (1 - pv)
        p_exactly_one = sum(
            ph * math.prod(1 - pj for h2, pj in p.items() if h2 != h)
            for h, ph in p.items()
        )
        total_burden = round(min(365, 365 * (1 - p_clear)), 1)
        multi_burden = round(min(365, 365 * max(0, 1 - p_clear - p_exactly_one)), 1)
        single_burden = round(total_burden - multi_burden, 1)
    else:
        total_burden = multi_burden = single_burden = 0.0

    DEMO_SENS = {
        "child":   {"heat": 1.2, "flood": 1.0, "drought": 1.3, "wet_bulb": 1.1, "pollution": 1.4},
        "elderly": {"heat": 1.5, "flood": 0.8, "drought": 1.0, "wet_bulb": 1.4, "pollution": 1.3},
        "women":   {"heat": 1.1, "flood": 1.0, "drought": 1.2, "wet_bulb": 1.0, "pollution": 1.1},
    }
    haz_by_name = {"heat": heat_haz, "flood": flood_haz, "drought": drought_haz,
                   "wet_bulb": wb_haz, "pollution": pollution_haz}
    weighted_burden = sum(
        d * (min(1, haz_by_name.get(h, 0) / 10)) * WASH_RELEVANCE.get(h, 0.5)
        for h, d in burden_hz_days.items()
    )
    weighted_child = sum(d * DEMO_SENS["child"].get(h, 1) * 0.1 for h, d in burden_hz_days.items())
    weighted_elderly = sum(d * DEMO_SENS["elderly"].get(h, 1) * 0.1 for h, d in burden_hz_days.items())

    all_risks = [flood_r, heat_r, cyc_r, drought_r, wb_r, ls_r, cw_r, ff_r, slr_r, fire_r, pollution_r]
    combined = max(all_risks)

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

    return {
        "flood_risk": round(flood_r, 2),
        "heat_risk": round(heat_r, 2),
        "cyclone_risk": round(cyc_r, 2),
        "drought_risk": round(drought_r, 2),
        "wetbulb_risk": round(wb_r, 2),
        "landslide_risk": round(ls_r, 2),
        "coldwave_risk": round(cw_r, 2),
        "flashflood_risk": round(ff_r, 2),
        "sealevel_risk": round(slr_r, 2),
        "fire_risk": round(fire_r, 2),
        "hex_risk": round(combined, 2),
        "pollution_risk": round(pollution_r, 2),
        "pm25_annual": round(pm25, 1),
        "wash_disruption_days": wash_disruption,
        "total_burden_days": total_burden,
        "single_hazard_days": single_burden,
        "multi_hazard_days": multi_burden,
        "weighted_burden": round(weighted_burden, 1),
        "weighted_burden_children": round(weighted_child, 1),
        "weighted_burden_elderly": round(weighted_elderly, 1),
        "heat_chronic_factor": round(heat_cf, 2),
        "drought_chronic_factor": round(drought_cf, 2),
        "wetbulb_chronic_factor": round(wb_cf, 2),
        "cascade_count": len(cascades),
        "cascade_actions": cascade_action_str,
        "_cascade_rule_ids": [c.rule_id for c in cascades],
    }
