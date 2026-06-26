"""
ClimResWASH risk formulas — pure-function implementation.
Source of truth: docs/formula_book.md
"""
import math

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

def heatwave_score(
    t_max_c: float,
    threshold_c: float,
    duration_days: int,
    built_pct: float,
    tree_pct: float,
    dist_water_m: float,
) -> float:
    """§2 — Heatwave hazard. Output 0–10."""
    excess = max(0.0, t_max_c - threshold_c)
    duration = min(duration_days, 5)
    base = (excess / 8) * (duration / 5) * 10
    urban_amp = 1 + 0.3 * (built_pct / 100)
    veg_cool = 1 - 0.2 * (tree_pct / 100)
    water_cool = 1 - 0.1 * math.exp(-dist_water_m / 3000)
    return min(10.0, base * urban_amp * veg_cool * water_cool)


# ── 3. Drought score (§3) ────────────────────────────────────────────────────

def drought_score(spi: float) -> float:
    """§3 — Meteorological drought. Output 0–10."""
    return max(0.0, min(10.0, -spi * 5))


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
    wind_ms = wind_max_kmh / 3.6
    surge_height = 0.013 * wind_ms ** 2 * bay_factor
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
    """§7 — Flood terrain sensitivity. Output 0–1."""
    return (
        0.3 * (1 - slope_deg / 30)
        + 0.3 * (1 - sand_pct / 100)
        + 0.2 * (built_pct / 100)
        + 0.2 * math.exp(-dist_water_m / 2000)
    )


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
    At extreme hazard (H≥10), AC effectiveness drops to 33% — catastrophic
    events overwhelm even good infrastructure. At low hazard (H≤5), AC
    applies fully. This prevents well-served areas from scoring near-zero
    during genuine disasters (Mumbai 2005, Kerala 2018)."""
    ac_dampening = max(0.2, 1 - hazard_score / 12)
    effective_ac = ac * ac_dampening
    risk = (hazard_score * exposure * sensitivity) * (1 - effective_ac) / 10
    return max(0.0, min(10.0, risk + cascade_amplifiers))
