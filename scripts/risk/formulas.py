"""
ClimResWASH risk formulas — pure-function implementation.
Source of truth: docs/formula_book.md
"""
import math
from statistics import NormalDist

# ── Rainfall lookup table for pluvial flood base score (§1) ───────────────────

_RAIN_TABLE: list[tuple[float, float]] = [
    (0.0,   0.0),
    (7.5,   2.0),
    (35.5,  4.0),
    (64.5,  6.0),
    (124.5, 8.0),
    (244.4, 10.0),
]


def _rain_base(rainfall_mm: float) -> float:
    """Linearly interpolate pluvial flood base score from the IMD table."""
    if rainfall_mm <= 0:
        return 0.0
    if rainfall_mm >= _RAIN_TABLE[-1][0]:
        return _RAIN_TABLE[-1][1]
    for i in range(len(_RAIN_TABLE) - 1):
        lo_r, lo_s = _RAIN_TABLE[i]
        hi_r, hi_s = _RAIN_TABLE[i + 1]
        if lo_r <= rainfall_mm <= hi_r:
            t = (rainfall_mm - lo_r) / (hi_r - lo_r)
            return lo_s + t * (hi_s - lo_s)
    return 0.0


# ── 1. Pluvial flood score (§1) ──────────────────────────────────────────────

def pluvial_flood_score(
    rainfall_24h_mm: float,
    sand_pct: float,
    built_pct: float,
    slope_deg: float,
) -> float:
    """§1 — Pluvial flood hazard. Output 0–10."""
    base = _rain_base(rainfall_24h_mm)
    infiltration = (sand_pct / 100) * (1 - built_pct / 100)
    drainage = max(0.3, slope_deg / 5)
    amplifier = (1 - 0.6 * infiltration) / drainage
    return min(10.0, base * amplifier)


# ── 2. Heatwave score (§2) ───────────────────────────────────────────────────

# Soft knee: scores above this are compressed instead of hard-clipped at 10, so
# hexes stay distinguishable once warming pushes many of them past the old cap.
HEAT_KNEE = 8.0
# Spell lengthening per °C of warming (heat-wave spells get longer as well as hotter).
HEAT_SPELL_GAIN = 0.15


def _soft_cap(x: float, knee: float = HEAT_KNEE, cap: float = 10.0) -> float:
    """Identity up to `knee`, then asymptotically approaches `cap` (continuous, monotonic,
    slope 1 at the knee)."""
    if x <= knee:
        return x
    room = cap - knee
    return knee + room * (1 - math.exp(-(x - knee) / room))


def heatwave_score(
    t_max_c: float,
    threshold_c: float,
    duration_days: int,
    built_pct: float,
    tree_pct: float,
    dist_water_m: float,
    warming_c: float = 0.0,
) -> float:
    """§2 — Heatwave hazard. Output 0–10.

    warming_c: additional warming (°C, vs the t_max_c baseline) for climate scenarios.
    The threshold is held fixed (it is a physiological/IMD criterion, not a climatology),
    so warming raises the excess AND lengthens the spell:
        excess   = max(0, t_max + warming - threshold)
        duration = min(5, duration * (1 + 0.15 * warming))
    Scores above 8 are soft-compressed toward 10 rather than hard-clipped, so hexes
    keep their rank order under strong warming. With warming_c=0 and scores <= 8
    this is identical to the original formula.
    """
    warming = max(0.0, warming_c)
    excess = max(0.0, t_max_c + warming - threshold_c)
    duration = min(duration_days * (1 + HEAT_SPELL_GAIN * warming), 5.0)
    base = (excess / 8) * (duration / 5) * 10
    urban_amp = 1 + 0.3 * (built_pct / 100)
    veg_cool = 1 - 0.2 * (tree_pct / 100)
    water_cool = 1 - 0.1 * math.exp(-dist_water_m / 3000)
    return _soft_cap(base * urban_amp * veg_cool * water_cool)


# ── 2b. Excess Heat Factor (Nairn & Fawcett 2013/2015; Australian BoM) ──────────
# International heatwave index, validated against heat-related health outcomes.
# Daily mean temperature T = (Tmax + Tmin) / 2 (so hot nights count).

def excess_heat_factor(
    daily_mean_c: list,
    t95_c: float,
    prior_30d_mean_c: float,
) -> float:
    """EHF for the 3-day window ending today. °C².

    daily_mean_c: the last 3 daily mean temperatures [day-2, day-1, today].
    t95_c: 95th percentile of daily mean temperature for this location (climatology,
        e.g. 1991-2020).
    prior_30d_mean_c: mean daily mean temperature of the 30 days BEFORE the 3-day window.

        EHI_sig  = T3 - T95            (is it hot vs local climate?)
        EHI_accl = T3 - T30            (hotter than what people are acclimatised to?)
        EHF      = EHI_sig * max(1, EHI_accl)
    EHF > 0 means heatwave conditions.
    """
    if len(daily_mean_c) != 3:
        raise ValueError("excess_heat_factor needs exactly 3 daily mean temperatures")
    t3 = sum(daily_mean_c) / 3
    return (t3 - t95_c) * max(1.0, t3 - prior_30d_mean_c)


def ehf_score(ehf: float, ehf85: float) -> float:
    """Map EHF to a 0–10 hazard score using the standard severity bands.

    S = EHF / EHF85, where EHF85 is the 85th percentile of positive EHF at this
    location (BoM: S>=1 'severe', S>=3 'extreme'). Piecewise, continuous, monotonic:
        S <= 0  -> 0          0 < S < 1 -> 0..5 (low-intensity)
        S >= 1  -> 5 .. 10, asymptotic (S=3 -> ~8.7)
    Our banding of the score is an engineering choice; the EHF and S bands are not.
    """
    if ehf <= 0 or ehf85 <= 0:
        return 0.0
    ratio = ehf / ehf85
    if ratio < 1:
        return 5.0 * ratio
    return 5.0 + 5.0 * (1 - math.exp(-(ratio - 1) / 1.5))


def heat_threshold_smooth(elev_m: float, dist_coast_m: float) -> float:
    """Heat-wave threshold (deg C) that varies continuously with elevation.

    IMD uses 40 C for plains, 37 C coastal, 30 C hills. The step rule `elev > 800 -> 30`
    (hex_risk.py) makes plateau hexes just above 800 m (Satpura, Chota Nagpur, Deccan) score
    as if they were hill stations. Here the plains/coastal value blends linearly into 30 C
    between 500 m and 1,500 m, so there is no cliff.
    """
    base = 37.0 if dist_coast_m < 50000 else 40.0
    w = min(1.0, max(0.0, (elev_m - 500.0) / 1000.0))
    return base * (1 - w) + 30.0 * w


# ── 1b. Seasonal flood hazard (4-D flood layer) ──────────────────────────────
# Extreme-rain intensification per deg C of mean warming: Clausius-Clapeyron, ~7 %/C
# (IPCC AR6 WG1 Ch.11: heavy-rain intensity rises ~7 %/C; South Asian monsoon extremes at
# least that). Applied to storm depth and to river-flood potential alike.
FLOOD_INTENSIFICATION_PER_C = 0.07


# Heavy-rain days (>50 mm) per month at which a month counts as "reliably hit" (occurrence
# 1 - exp(-1) = 63 %). ASSUMPTION: 1 day/month; v2 sets this ref from the national distribution.
FLOOD_REF_DAYS_PER_MONTH = 1.0


def flood_occurrence_month(heavy_days_month: float, warming_c: float = 0.0) -> float:
    """Smooth occurrence 0-1 from expected >50 mm days in the month (review v2 §3.1):
    1 - exp(-days / ref). Warming scales the exceedance count by the same 7 %/C as storm depth
    (conservative: the true tail grows faster)."""
    if heavy_days_month <= 0:
        return 0.0
    intensify = 1.0 + FLOOD_INTENSIFICATION_PER_C * max(0.0, warming_c)
    return 1.0 - math.exp(-heavy_days_month * intensify / FLOOD_REF_DAYS_PER_MONTH)


def pluvial_ponding_modifier(flat_pct: float, built_pct: float, sand_pct: float) -> float:
    """Terrain modifier for local ponding, bounded to 0.5–1.5 (flood review v2 §3.1).

    Replaces the legacy division by slope (x3.3 on flat land, which saturated 89 % of hexes
    at 10). Flat land, built-up (impervious) land and clay soil pond more:
        0.5 + 0.5 x flat_share + 0.3 x built_share + 0.2 x (1 - sand_share)
    The three weights are UNCALIBRATED engineering choices, like the review's other v2 weights.
    """
    flat = min(1.0, max(0.0, flat_pct / 100.0))
    built = min(1.0, max(0.0, built_pct / 100.0))
    sand = min(1.0, max(0.0, sand_pct / 100.0))
    return 0.5 + 0.5 * flat + 0.3 * built + 0.2 * (1.0 - sand)


def flood_hazard_seasonal(
    rp10_mm: float,
    sand_pct: float,
    built_pct: float,
    flat_pct: float,
    floodplain_pct: float,
    heavy_days_month: float,
    season_share: float,
    warming_c: float = 0.0,
) -> float:
    """Flood hazard for one month under optional warming. Output 0–10.

    Follows the v2 split in the flood review (flood_risk = max(pluvial, riverine)):
      severity  = IMD_table(10-yr 24 h rain x intensification) x pluvial_ponding_modifier
      pluvial   = severity x flood_occurrence_month(expected >50 mm days that month)
      riverine  = floodplain_pct/10 x season_share x intensification
    season_share = monthly precipitation / wettest month (0-1); intensification =
    1 + 7 %/C x mean warming. Scores above 8 are soft-compressed (see _soft_cap).
    """
    intensify = 1.0 + FLOOD_INTENSIFICATION_PER_C * max(0.0, warming_c)
    severity = _rain_base(rp10_mm * intensify) * pluvial_ponding_modifier(flat_pct, built_pct, sand_pct)
    pluvial = severity * flood_occurrence_month(heavy_days_month, warming_c)
    riverine = (floodplain_pct / 10.0) * min(1.0, max(0.0, season_share)) * intensify
    return _soft_cap(max(pluvial, riverine))


# ── 3. Drought score (§3) ────────────────────────────────────────────────────

def drought_score(spi: float) -> float:
    """§3 — Meteorological drought. Output 0–10."""
    return max(0.0, min(10.0, -spi * 5))


# ── 3b. Seasonal drought hazard (4-D drought layer) ──────────────────────────
# Rainfall-shortfall hazard on 3-month accumulations (the SPI-3 window used by drought monitors).
# SPI itself is standardised, so it is the same everywhere by construction and cannot rank
# places; this uses the ABSOLUTE shortfall of a 1-in-10-year dry window instead, which depends on
# how variable the local rainfall is (arid and monsoon-edge climates score high, steady wet ones low). Scale anchored on IMD deficit classes.
DROUGHT_RETURN_P = 0.10          # 1-in-10-year dry window
# IMD classes: seasonal rain deficit >= 25 % of normal is 'moderate', >= 50 % 'severe'. Scale chosen so a
# 25 % shortfall scores 3.75 (moderate band) and 50 % scores 7.5 (high); 2/3 maps to 10 before the soft cap.
DROUGHT_FULL_SHORTFALL = 2.0 / 3.0
# Climate-change terms, ASSUMPTIONS (AR6: more variable monsoon, higher evaporative demand):
DROUGHT_VARIABILITY_PER_C = 0.05  # interannual variability (CV) grows 5 % per C of mean warming
DROUGHT_SUPPLY_PER_C = 0.01       # effective water supply falls 1 %/C (rain +3 %/C minus evaporative demand +4 %/C)


def gamma_quantile_ratio(cv: float, p: float = DROUGHT_RETURN_P) -> float:
    """p-quantile / mean of a gamma distribution with coefficient of variation `cv`.

    Wilson-Hilferty approximation (pure python, no scipy): accurate to ~2 % for cv <= 0.6 and
    still ~0 for very variable (cv >= 1) rainfall, where the 1-in-10 window is nearly dry.
    """
    if cv <= 0:
        return 1.0
    k = 1.0 / (cv * cv)
    z = NormalDist().inv_cdf(p)
    c = 1.0 - 1.0 / (9.0 * k) + z * math.sqrt(1.0 / (9.0 * k))
    return max(0.0, c) ** 3


def drought_hazard_seasonal(cv: float, window_share: float, peak_window_share: float,
                            warming_c: float = 0.0) -> float:
    """Drought hazard for the 3-month window ending in a calendar month. Output 0–10.

        shortfall = 1 - quantile_10(window rain under warming) / (baseline normal)
        severity  = soft_cap(10 x shortfall / (2/3))   # 25 % -> 3.75, 50 % -> 7.5
        hazard    = severity x min(1, window_share / peak_window_share)
    cv: coefficient of variation of that window's rainfall (1991-2020);
    window_share: that window's mean rain / annual mean rain; peak_window_share: the same for the hex's
    wettest 3-month window. A deficit matters when rain is due, so the main rainy season gets full
    weight and secondary or dry windows are scaled down in proportion.
    Warming raises cv by 5 %/C and lowers effective supply 1 %/C (both assumptions), measured
    against the BASELINE normal because people and crops are adapted to it.
    """
    w = max(0.0, warming_c)
    ratio = gamma_quantile_ratio(cv * (1.0 + DROUGHT_VARIABILITY_PER_C * w)) * (1.0 - DROUGHT_SUPPLY_PER_C * w)
    shortfall = min(1.0, max(0.0, 1.0 - ratio))
    severity = _soft_cap(10.0 * shortfall / DROUGHT_FULL_SHORTFALL)
    if peak_window_share <= 0:
        return 0.0
    return severity * min(1.0, max(0.0, window_share / peak_window_share))


# ── 4. Wet bulb temperature (§4) — Stull approximation ──────────────────────

def wet_bulb_temp(t_c: float, rh_pct: float) -> float:
    """§4 — Stull (2011) wet-bulb approximation. All arctan calls use radians."""
    return (
        t_c * math.atan(0.151977 * math.sqrt(rh_pct + 8.313659))
        + math.atan(t_c + rh_pct)
        - math.atan(rh_pct - 1.676331)
        + 0.00391838 * rh_pct ** 1.5 * math.atan(0.023101 * rh_pct)
        - 4.686035
    )


# ── 5. Wet bulb score (§4) ───────────────────────────────────────────────────

def wet_bulb_score(t_c: float, rh_pct: float) -> float:
    """§4 — Wet-bulb hazard. Output 0–10."""
    twb = wet_bulb_temp(t_c, rh_pct)
    return max(0.0, min(10.0, (twb - 28) * 10 / 7))


# ── 5a. Seasonal wet-bulb hazard (4-D wet-bulb layer) ────────────────────────
# Hottest-humid-day uplift of wet-bulb over the monthly-mean afternoon wet-bulb (deg C). ASSUMPTION:
# afternoon wet-bulb varies day to day with sigma ~1 C in humid climates, and the month's hottest humid
# day sits ~2 sigma above its mean. (Adding the uplift to air temperature at a fixed dewpoint would
# understate it: on real hot-humid days dewpoint rises too.)
WB_HOT_TAIL_C = 2.0


def rh_from_dewpoint(t_c: float, td_c: float) -> float:
    """Relative humidity (%) from air and dewpoint temperature (Magnus / Alduchov-Eskridge)."""
    td = min(td_c, t_c)  # dewpoint cannot exceed air temperature
    es_t = math.exp(17.625 * t_c / (243.04 + t_c))
    es_td = math.exp(17.625 * td / (243.04 + td))
    return max(0.0, min(100.0, 100.0 * es_td / es_t))


def wet_bulb_hazard_seasonal(t_c: float, td_c: float, warming_c: float = 0.0,
                             hot_tail_c: float = WB_HOT_TAIL_C) -> float:
    """Wet-bulb hazard for the hottest humid afternoon of a calendar month. Output 0–10.

    t_c, td_c: monthly-mean air and dewpoint temperature at the same afternoon hour (ERA5).
        mean state : RH from (t, td) by Magnus
        warming    : air temperature + warming_c at CONSTANT RH (land RH changes little; AR6 medium
                     confidence) -> Stull (2011) wet-bulb
        hot day    : + hot_tail_c on the wet-bulb itself
        score      : same 28 C -> 0, 35 C -> 10 mapping as wet_bulb_score(), but soft-compressed
                     above 8 instead of hard-clipped, so hexes stay ranked under warming.
    """
    rh = max(5.0, min(99.0, rh_from_dewpoint(t_c, td_c)))  # Stull (2011) is valid for RH 5-99 %
    twb = wet_bulb_temp(t_c + max(0.0, warming_c), rh) + hot_tail_c
    return _soft_cap(max(0.0, (twb - 28.0) * 10.0 / 7.0))


def wet_bulb_hazard_best_hour(pairs, warming_c: float = 0.0, hot_tail_c: float = WB_HOT_TAIL_C) -> float:
    """Wet-bulb hazard for a month given monthly-mean (T, Td) pairs at several afternoon hours.

    Scores EVERY hour's pair and returns the maximum. The hour with the highest air temperature is
    not necessarily the hour with the highest wet-bulb (a hotter hour can be drier), so selecting
    by dry-bulb temperature can miss the most humid heat (audit finding, 20 Oct 2026).
    """
    return max(wet_bulb_hazard_seasonal(t, td, warming_c, hot_tail_c) for t, td in pairs)


# ── 5c. Rain-triggered slope hazards: landslide and flash flood (4-D layers) ─
# International practice (INFORM, ThinkHazard, NASA LHASA, flash-flood potential indices) scores
# susceptibility (terrain, cover) x trigger (heavy rain). The legacy channels had only the terrain
# half (static, no season, no rain), which is why landslide peaked on dry Leh.
# Trigger = intensity (hex 10-yr daily rain vs a reference) x occurrence (expected >50 mm days that
# month), so it follows the monsoon and strengthens with warming (+7 %/C, as for floods).
LANDSLIDE_TRIGGER_REF_MM = 150.0   # IMD 'very heavy' band; at/above this the intensity term is full
FLASH_FLOOD_TRIGGER_REF_MM = 100.0  # flash floods need less depth: short, intense bursts


def rain_trigger_month(rp10_mm: float, heavy_days_month: float, warming_c: float, ref_mm: float) -> float:
    """Rain trigger 0-1 for a calendar month: min(1, 10-yr daily rain x intensification / ref) x
    smooth occurrence of >50 mm days (flood_occurrence_month)."""
    intensify = 1.0 + FLOOD_INTENSIFICATION_PER_C * max(0.0, warming_c)
    intensity = min(1.0, max(0.0, rp10_mm * intensify / ref_mm))
    return intensity * flood_occurrence_month(heavy_days_month, warming_c)


def landslide_susceptibility(slope_deg: float, ndvi: float) -> float:
    """Landslide susceptibility 0-1. Rises smoothly with slope above 5 deg (1 - exp(-(s-5)/10):
    10 deg 0.39, 20 deg 0.78, 30 deg 0.92) and is reduced by vegetation cover (x (1.2 - NDVI)/1.2,
    the legacy engine's vegetation term). Weights are UNCALIBRATED; geology, roads and forest loss
    (as in NASA LHASA) are not available."""
    s = 1.0 - math.exp(-max(0.0, slope_deg - 5.0) / 10.0)
    veg = min(1.0, max(0.0, ndvi))
    return s * (1.2 - veg) / 1.2


def landslide_hazard_seasonal(slope_deg: float, ndvi: float, rp10_mm: float,
                              heavy_days_month: float, warming_c: float = 0.0) -> float:
    """Landslide hazard for a calendar month. Output 0–10 = 10 x susceptibility x rain trigger."""
    trig = rain_trigger_month(rp10_mm, heavy_days_month, warming_c, LANDSLIDE_TRIGGER_REF_MM)
    return _soft_cap(10.0 * landslide_susceptibility(slope_deg, ndvi) * trig)


def flash_flood_susceptibility(slope_deg: float, built_pct: float, sand_pct: float,
                               ndvi: float, dist_water_m: float) -> float:
    """Flash-flood potential 0-1, FFPI-style: 0.35 steepness (saturating at 15 deg) + 0.25 runoff
    (half imperviousness, half clay) + 0.20 sparse vegetation + 0.20 proximity to a channel
    (exp(-d/3000 m)). Weights UNCALIBRATED. Zero on flat ground (gate: slope/3 deg, max 1)."""
    slope_i = min(1.0, max(0.0, slope_deg / 15.0))
    runoff_i = 0.5 * min(1.0, max(0.0, built_pct / 100.0)) + 0.5 * (1.0 - min(1.0, max(0.0, sand_pct / 100.0)))
    veg_i = 1.0 - min(1.0, max(0.0, ndvi))
    chan_i = math.exp(-max(0.0, dist_water_m) / 3000.0)
    gate = min(1.0, max(0.0, slope_deg / 3.0))
    return gate * (0.35 * slope_i + 0.25 * runoff_i + 0.20 * veg_i + 0.20 * chan_i)


def flash_flood_hazard_seasonal(slope_deg: float, built_pct: float, sand_pct: float, ndvi: float,
                                dist_water_m: float, rp10_mm: float, heavy_days_month: float,
                                warming_c: float = 0.0) -> float:
    """Flash-flood hazard for a calendar month. Output 0–10 = 10 x susceptibility x rain trigger."""
    trig = rain_trigger_month(rp10_mm, heavy_days_month, warming_c, FLASH_FLOOD_TRIGGER_REF_MM)
    return _soft_cap(10.0 * flash_flood_susceptibility(slope_deg, built_pct, sand_pct, ndvi, dist_water_m) * trig)


# ── 5d. Cold wave (4-D layer) ────────────────────────────────────────────────
# IMD criteria: cold wave when the minimum temperature is <= 10 C in the plains (<= 0 C in hills)
# AND 4.5 C or more below normal (severe: 6.5 C). The legacy channel used latitude and elevation only.
COLD_TAIL_C = 4.5  # a cold-wave night is 4.5 C below the monthly-mean minimum (IMD departure)


def cold_threshold_smooth(elev_m: float) -> float:
    """Cold-wave threshold (deg C) for the minimum temperature: 10 C in the plains, blending
    continuously to 0 C (IMD hill criterion) between 500 m and 1,500 m (no step, as for heat)."""
    w = min(1.0, max(0.0, (elev_m - 500.0) / 1000.0))
    return 10.0 * (1.0 - w)


def coldwave_hazard_seasonal(tmin_c: float, elev_m: float, warming_c: float = 0.0) -> float:
    """Cold-wave hazard for a calendar month. Output 0–10.

    tmin_c: monthly-mean daily minimum (here the 05:30 IST ERA5 mean). Cold night = tmin - 4.5 C,
    warmed by `warming_c` (cold nights warm at least as fast as the mean: AR6). Score = degrees the
    cold night falls below the IMD threshold, 1 point per C, soft-compressed above 8. Hills that
    are always below threshold (Ladakh) score high all winter; adaptation sits in the risk formula.
    """
    cold_night = tmin_c - COLD_TAIL_C + max(0.0, warming_c)
    return _soft_cap(max(0.0, cold_threshold_smooth(elev_m) - cold_night))


# ── 5b. Air pollution score (PM2.5, WHO-anchored) ───────────────────────────

_PM25_TABLE: list[tuple[float, float]] = [
    (0, 0), (5, 1), (15, 3), (25, 5), (35, 7), (50, 9), (75, 10),
]


def air_pollution_score(pm25_annual: float) -> float:
    """PM2.5 annual mean (ug/m3) → 0-10 hazard. WHO guideline 5, NAAQS 40."""
    if pm25_annual <= 0:
        return 0.0
    if pm25_annual >= _PM25_TABLE[-1][0]:
        return _PM25_TABLE[-1][1]
    for i in range(len(_PM25_TABLE) - 1):
        lo_p, lo_s = _PM25_TABLE[i]
        hi_p, hi_s = _PM25_TABLE[i + 1]
        if lo_p <= pm25_annual <= hi_p:
            t = (pm25_annual - lo_p) / (hi_p - lo_p)
            return lo_s + t * (hi_s - lo_s)
    return 0.0


# ── 6. Cyclone score (§5) ────────────────────────────────────────────────────

def cyclone_score(
    wind_max_kmh: float,
    dist_track_km: float,
    rainfall_24h_mm: float,
    sand_pct: float,
    built_pct: float,
    slope_deg: float,
    dist_coast_m: float,
    elev_m: float,
    bay_factor: float = 1.0,
) -> float:
    """§5 — Cyclone hazard (max of wind / rain-band / coastal surge). Output 0–10."""
    # Wind
    wind_at_hex = wind_max_kmh * math.exp(-dist_track_km / 150)
    wind_sc = min(10.0, wind_at_hex / 25)

    # Rain band
    rain_band_factor = math.exp(-dist_track_km / 300)
    rain_band_sc = pluvial_flood_score(rainfall_24h_mm, sand_pct, built_pct, slope_deg) * rain_band_factor

    # Coastal surge
    # BUG FIX: 0.013 produced 22-29m surge at a routine severe-cyclone wind
    # speed (150 km/h) -- 2-3x the worst real-world reference (Bhola 1970,
    # ~10m, the deadliest storm surge on record; Amphan 2020 near the
    # Sundarbans at comparable wind speed, ~4-5m observed). Recalibrated so
    # 150 km/h at bay_factor=1.3 lands at ~5m (Amphan-comparable), reserving
    # a higher ceiling (~14m at bay_factor=1.3) for a hypothetical 250 km/h
    # storm -- above every recorded Bay of Bengal cyclone, appropriately,
    # since 250 km/h sustained wind is itself far beyond anything observed
    # there.
    wind_ms = wind_max_kmh / 3.6
    surge_height = 0.0022 * wind_ms ** 2 * bay_factor
    proximity = math.exp(-dist_coast_m / 10000)
    elev_protection = max(0.0, 1 - elev_m / max(surge_height, 0.01))
    coastal_sc = min(10.0, surge_height * 2 * proximity * elev_protection)

    return min(10.0, max(wind_sc, rain_band_sc, coastal_sc))


# ── 7. Exposure score (§6) ───────────────────────────────────────────────────

def exposure_score(
    population: int,
    children_under5_pct: float,
    elderly_60plus_pct: float,
    women_15_49_pct: float,
) -> float:
    """§6 — Population exposure. Output 0–10."""
    if population <= 0:
        return 0.0
    vuln_frac = children_under5_pct + elderly_60plus_pct + women_15_49_pct * 0.3
    return min(10.0, math.log10(population) * 2 * (1 + vuln_frac / 100))


# ── 8. Flood sensitivity (§7) ────────────────────────────────────────────────

def flood_sensitivity(
    slope_deg: float,
    sand_pct: float,
    built_pct: float,
    dist_water_m: float,
) -> float:
    """§7 — Flood terrain sensitivity. Output 0–1.

    BUG FIX: the slope term used to go negative for slope_deg > 30 (Western
    Ghats escarpments, Uttarakhand hill hexes routinely exceed 30 degrees
    from H3-neighbor elevation differences) -- a negative term inside a sum
    that's supposed to land in [0,1] silently UNDERSTATED flood sensitivity
    in the steepest terrain, the opposite of physically realistic (steep
    slopes shed water fast but concentrate it violently downslope -- flash
    flood territory, not flood-proof territory). Clamped the slope term at
    its own floor of 0, and the full return value to [0,1] per this
    function's documented range, so a stacked/rounding edge case elsewhere
    can't push it out of bounds either."""
    val = (
        0.3 * max(0.0, 1 - slope_deg / 30)
        + 0.3 * (1 - sand_pct / 100)
        + 0.2 * (built_pct / 100)
        + 0.2 * math.exp(-dist_water_m / 2000)
    )
    return max(0.0, min(1.0, val))


# ── 9. Heat sensitivity ──────────────────────────────────────────────────────

def heat_sensitivity(
    tree_pct: float,
    built_pct: float,
    dist_water_m: float,
) -> float:
    """Heat terrain sensitivity, derived from §2 modifier structure. Output 0–1."""
    return (
        0.4 * (built_pct / 100)
        + 0.3 * (1 - tree_pct / 100)
        + 0.3 * (1 - math.exp(-dist_water_m / 3000))
    )


# ── 10. Adaptive capacity (§8) ───────────────────────────────────────────────

def adaptive_capacity(
    toilet_pct: float,
    piped_water_pct: float,
    health_access_pct: float,
    electricity_pct: float,
    poverty_pct: float,
    female_literacy_pct: float,
) -> float:
    """§8 — WASH-weighted adaptive capacity. Output 0–1."""
    return (
        0.25 * (toilet_pct / 100)
        + 0.20 * (piped_water_pct / 100)
        + 0.15 * (health_access_pct / 100)
        + 0.10 * (electricity_pct / 100)
        + 0.15 * (1 - poverty_pct / 100)
        + 0.15 * (female_literacy_pct / 100)
    )


# ── 11. Final risk (§9 + §10) ────────────────────────────────────────────────

def compute_risk(
    hazard_score: float,
    exposure: float,
    sensitivity: float,
    ac: float,
    cascade_amplifiers: float = 0.0,
) -> float:
    """§9–10 — Risk with hazard-intensity AC dampening.
    At extreme hazard (H≥9.6), AC effectiveness floors at 20% (max(0.2, ...) --
    DOCSTRING FIX, see chat: this used to say 33%, which the code has never
    actually done) -- catastrophic events overwhelm even good infrastructure,
    but some residual adaptive benefit is retained even at extreme hazard
    rather than going to zero. At low hazard (H≤5), AC applies fully. This
    prevents well-served areas from scoring near-zero during genuine
    disasters (Mumbai 2005, Kerala 2018)."""
    ac_dampening = max(0.2, 1 - hazard_score / 12)
    effective_ac = ac * ac_dampening
    risk = (hazard_score * exposure * sensitivity) * (1 - effective_ac) / 10
    return max(0.0, min(10.0, risk + cascade_amplifiers))
