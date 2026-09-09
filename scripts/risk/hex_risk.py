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
    join_hex_districts.py uses — needs only the set of hex states, not geometry.

    FIX (see chat, state-aliasing audit): nfhs5_wash.json contains real,
    genuinely distinct data for post-bifurcation states as ".."-prefixed rows
    (e.g. "..Uttarakhand", toilet_pct=92.5) ALONGSIDE a combined/historical
    row for the pre-split survey unit (e.g. "Uttar Pradesh, inc Uttarakhand",
    toilet_pct=76.3, a UP+Uttarakhand blend) -- confirmed these are real,
    separately-surveyed NFHS-5 numbers, not duplicates or a parsing artifact.
    The old single-pass substring match iterated wash_raw in file order and
    `break`ed on the FIRST hit, which was always the combined row (it appears
    before its own ".."-prefixed children) for any state whose name is a
    substring of the combined row's name -- silently misrouting Uttarakhand,
    Uttar Pradesh, Chhattisgarh, Madhya Pradesh, Jharkhand, Bihar, Telangana,
    Andhra Pradesh, and Ladakh away from their own dedicated data. Worse,
    since Python dict values are references, TWO states matching the SAME
    combined row (e.g. both "Uttarakhand" and "Uttar Pradesh" hit "Uttar
    Pradesh, inc Uttarakhand") ended up with wash_by_state entries pointing
    at the literal same dict object, so `vals["poverty_pct"] = ...` for
    whichever state was processed second silently overwrote the first's.
    Fixed with two passes: (1) exact match against the dedicated row first
    (state's own name, ".."-prefix stripped) -- always preferred when it
    exists; (2) substring/combined-row match only as a fallback for states
    with no dedicated row (e.g. the multi-UT combined entries, unaffected by
    this bug). Also copies the matched dict instead of mutating wash_raw's
    own value in place, so no two states can ever alias the same object
    again even in an unanticipated future case.
    Verified against all 35 real hex states: only the above 9 states' match
    target changes; every other state matches identically to before.
    """
    wash_by_state: dict[str, dict] = {}
    for hex_state in states:
        if not hex_state or hex_state == "Unknown":
            continue
        hs_lower = hex_state.lower().replace("&", "and")

        matched = None
        for dhs_name, vals in wash_raw.items():
            ds_lower = dhs_name.lower().replace("&", "and").replace("..", "")
            if hs_lower == ds_lower:
                matched = vals
                break
        if matched is None:
            for dhs_name, vals in wash_raw.items():
                ds_lower = dhs_name.lower().replace("&", "and").replace("..", "")
                if hs_lower in ds_lower or ds_lower in hs_lower:
                    matched = vals
                    break

        if matched is not None:
            vals = dict(matched)  # copy -- never mutate/alias wash_raw's own dict
            vals["poverty_pct"] = mpi_raw.get(hex_state, 20.0)
            wash_by_state[hex_state] = vals
        else:
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


def resolve_static_hex_inputs(row, lat: float, lon: float, wash_by_state: dict, state_ac: dict) -> dict:
    """Terrain/land-use/exposure/adaptive-capacity inputs shared by every hazard
    channel in compute_hex_risk() -- none of this depends on weather. Split out
    so compute_forecast.py's live 7-day weather-driven scoring can call this
    exact resolution instead of maintaining its own (drifting) local copies of
    slope/water-distance/sand%/exposure/AC estimation -- see chat, compute_forecast.py
    unification. Pure extraction: verified byte-identical compute_hex_risk() output
    before/after this split.
    """
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

    # BUG 6 (see chat): heat_sensitivity()/heatwave_score() used dist_w above, which
    # only finds a hex's nearest "water"-tagged NEIGHBOR HEX -- misses real rivers/
    # streams too narrow for a 15km-spaced hex centroid to land on. Confirmed on 6
    # major rivers (Ganga/Varanasi, Godavari/Nashik, Krishna/Vijayawada, Yamuna/Delhi,
    # Narmada/Jabalpur, Brahmaputra/Guwahati): dist_w read 17-61km when the true
    # distance is under 10km. dist_to_river_km (real OSM river-line geometry,
    # fetch_river_distance.py, 100% hex coverage) is the real signal -- wired in HERE
    # ONLY, for heat_sensitivity/heatwave_score. NOT flood_sensitivity (fs, below,
    # keeps dist_w unchanged -- explicit instruction) and not landslide/flashflood
    # sensitivity (out of this fix's scope, still use dist_w).
    #
    # FIX (see chat): the min()-with-a-fallback safety net below used to be gated to
    # coastal hexes only (dist_coast < 1e6), on the reasoning that dist_to_river_km
    # can be unreliable near the coast when no river is nearby (Kachchh/Rann-of-Kutch:
    # 45-60km real river distance despite sitting on the coast). But dist_to_river_km
    # ONLY sees rivers (OSM river-line geometry) -- it has the exact same blind spot
    # inland for any hex correctly near a LAKE, RESERVOIR, or WETLAND instead (which
    # dist_w, from the real land_use=="water" hex tagging, DOES catch correctly).
    # Confirmed: a Kachchh hex with land_use=="water" itself (dist_w=0, i.e. sitting
    # AT the water) was reading dist_to_river_km=48.5km once the coastal gate excluded
    # it from the safety net -- same mechanism, just inland. "Prefer whichever real
    # signal shows closer water" has no reason to be geography-limited, so the gate is
    # gone -- unconditional now, every hex takes the closer of the two. This is still
    # NOT a fix for the separate open-ocean dist_w gap for hexes with no real water
    # feature (river OR lake) nearby at all -- still needs real coastline data.
    dist_river_km = row.get("dist_to_river_km")
    dist_river_km = float(dist_river_km) if dist_river_km is not None else 999.0
    dist_w_heat = min(dist_river_km * 1000, dist_w)

    fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
    hs = heat_sensitivity(tree_pct, built_pct, dist_w_heat)

    pop = int(row.get("population", 10000) or 10000)
    exposure_10 = exposure_score(max(1, pop), 9, 8, 25)
    state_name = str(row.get("state", "") or "")
    # FIX A (see chat, null-AC audit): a JSON null becomes float('nan') once this
    # reaches a pandas/geopandas DataFrame (adaptive_capacity is a float64 column).
    # `nan or 0` evaluates to nan (nan is truthy), so the old
    # `float(row.get(...) or 0)` line never actually produced 0 for a missing
    # value -- it produced nan, and `nan < 0.05` is always False, so the
    # state-level fallback below silently never fired for any null-AC hex
    # (831 of them). They fell through to `max(0.1, nan * ...)` = 0.1, the
    # platform's absolute floor, regardless of their real district. Checking
    # for missing/NaN explicitly, before the threshold comparison, fixes this
    # without changing anything for a hex that has a real (even genuinely low)
    # AC value -- those still go through ac_base normally and only hit the
    # fallback via the existing <0.05 threshold, unchanged.
    ac_raw = row.get("adaptive_capacity", 0)
    ac_missing = ac_raw is None or (isinstance(ac_raw, float) and math.isnan(ac_raw))
    ac_base = 0.0 if ac_missing else float(ac_raw)
    if ac_missing or ac_base < 0.05:
        ac_base = state_ac.get(state_name, 0.7)
    gw_stress = float(row.get("gw_stress_score", GW_DEFAULT) or GW_DEFAULT)
    ac = max(0.1, ac_base * (1 - AC_GW_PENALTY * gw_stress))

    return {
        "elev": elev, "lu": lu, "ndvi": ndvi,
        "tree_pct": tree_pct, "built_pct": built_pct, "sand_pct": sand_pct,
        "slope": slope, "dist_w": dist_w, "dist_w_heat": dist_w_heat,
        "dist_coast": dist_coast, "exposure_10": exposure_10,
        "state_name": state_name, "ac": ac, "gw_stress": gw_stress,
        "fs": fs, "hs": hs,
    }


def compute_hex_risk(row, lat: float, lon: float, wash_by_state: dict, state_ac: dict) -> dict:
    """Compute all RISK_COLS fields for one hex. Returns {col: value} plus
    an internal '_cascade_rule_ids' list for caller-side stats tracking."""
    inp = resolve_static_hex_inputs(row, lat, lon, wash_by_state, state_ac)
    elev, lu, ndvi = inp["elev"], inp["lu"], inp["ndvi"]
    tree_pct, built_pct, sand_pct = inp["tree_pct"], inp["built_pct"], inp["sand_pct"]
    slope, dist_w, dist_w_heat = inp["slope"], inp["dist_w"], inp["dist_w_heat"]
    dist_coast = inp["dist_coast"]
    exposure_10, state_name, ac, gw_stress = inp["exposure_10"], inp["state_name"], inp["ac"], inp["gw_stress"]
    fs, hs = inp["fs"], inp["hs"]

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
    heat_sev = heatwave_score(44, threshold, 3, built_pct, tree_pct, dist_w_heat)
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
    # BUG FIX (severity/probability audit, see chat): severity used to be
    # max(ndvi_based, drought_days-derived) and THEN drought_days was reused
    # again as occurrence in _occ_and_chronic() below -- the same frequency
    # signal counted twice, multiplicatively, in what's supposed to be two
    # independent terms (severity given occurrence, and probability of
    # occurrence). Severity now comes from the NDVI proxy alone; occurrence
    # carries the frequency signal, once.
    #
    # KNOWN, DELIBERATE REGRESSION this reintroduces -- read before shipping:
    # the drought_days-derived floor this removes was added in e1a8bb3 ("Fix
    # drought risk underestimation in irrigated arid zones") specifically
    # because the NDVI proxy alone was badly wrong for irrigated cropland in
    # the Thar belt and Marathwada -- green center-pivot fields read as
    # "not drought" by NDVI despite chronic underlying aridity. That commit's
    # own before/after numbers (avg district drought_risk): Barmer 1.73 →
    # 9.86, Jodhpur 0.78 → 8.74, Nagaur 0.37 → 6.88, Jaisalmer 4.75 → 8.70,
    # Latur 0.00 → 2.37. Removing the floor moves those numbers back toward
    # the LOW (pre-fix, documented-wrong) end -- see the verification numbers
    # below for exactly how far. This wasn't in your list of 5 bugs, so I
    # implemented the fix exactly as specified rather than silently keep the
    # floor under a different mechanism -- but you should decide this one
    # with the real numbers in hand, not by trusting doc-comment prose (mine
    # or the original commit's).
    # BUG FIX: spi_proxy compares each hex's ABSOLUTE current-season NDVI to
    # one flat national threshold (0.4) -- not a departure from that hex's
    # own normal. Real SPI is a standardized anomaly (z-score against a
    # location's own long-run distribution); this proxy has no "own normal"
    # to compare against, so naturally low-NDVI land cover (Thar barren/
    # scrub, Deccan dry grassland) reads as chronic severe drought from its
    # baseline alone, every year, anomaly or not -- not fixable by
    # reweighting or re-centering without inventing numbers this platform
    # doesn't have. NO PER-HEX NDVI BASELINE EXISTS to compute a real z-score
    # from: fetch_ndvi.py pulls a single Aug-Sep 2023 MODIS composite per
    # hex, not a multi-year time series, so there's no real per-hex mean/std
    # to standardize against. Faking one (e.g. assuming a distribution) would
    # produce a more confident-LOOKING number that's no more accurate than
    # this one, so I have not done that.
    #
    # What would actually fix this: either (a) a multi-year, season-matched
    # per-hex NDVI time series (e.g. re-run fetch_ndvi.py's MODIS query
    # across the same Aug-Sep window for ~5-10 years, then store per-hex
    # mean+std) to compute a genuine z-score, or (b) bypass vegetation
    # entirely and compute real SPI from gridded rainfall (IMD 0.25° gridded
    # daily rainfall, or CHIRPS) -- which is what SPI is actually defined on,
    # and has no land-cover confound at all. (b) is the more standard fix if
    # you want to source it before the demo; (a) is closer to what's already
    # wired up (same MODIS endpoint, just called repeatedly).
    #
    # Interim mitigation only (not a real fix, see above): cap how much
    # confidence this proxy alone can claim -- 7.0 rather than the full 0-10
    # scale, since a top-of-scale "catastrophic" reading shouldn't be
    # assertable from land-cover baseline alone with no real anomaly signal
    # behind it. This is a blunt cap, not a correction -- it does not
    # specifically discount naturally-arid land types differently from
    # anything else; it just stops the least-trustworthy signal here from
    # claiming the most extreme scores.
    spi_proxy = (ndvi - 0.4) * 3
    if sand_pct > 50:
        spi_proxy -= 0.5
    drought_sev = min(7.0, drought_score(spi_proxy))
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
