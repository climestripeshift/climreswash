import math
"""Unit tests for ClimResWASH risk formulas — expectations from formula_book.md."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from risk.formulas import (
    adaptive_capacity,
    compute_risk,
    cyclone_score,
    drought_score,
    exposure_score,
    flood_sensitivity,
    heat_sensitivity,
    heatwave_score,
    drought_hazard_seasonal,
    excess_heat_factor,
    gamma_quantile_ratio,
    flood_hazard_seasonal,
    pluvial_ponding_modifier,
    flood_occurrence_month,
    cold_threshold_smooth,
    coldwave_hazard_seasonal,
    flash_flood_hazard_seasonal,
    flash_flood_susceptibility,
    heat_threshold_smooth,
    landslide_hazard_seasonal,
    landslide_susceptibility,
    rain_trigger_month,
    rh_from_dewpoint,
    wet_bulb_hazard_best_hour,
    wet_bulb_hazard_seasonal,
    wet_bulb_temp,
    ehf_score,
    pluvial_flood_score,
    wet_bulb_score,
    wet_bulb_temp,
    air_pollution_score,
)


# ── 1. Pluvial flood ─────────────────────────────────────────────────────────

def test_pluvial_flood_mumbai():
    """Mumbai: 30 mm, sand=20%, built=70%, slope=0.5° → capped at 10."""
    assert pluvial_flood_score(30, 20, 70, 0.5) == pytest.approx(10.0, rel=0.05)


def test_pluvial_flood_jaisalmer():
    """Jaisalmer: same rain, sandy soil absorbs → 6.5."""
    assert pluvial_flood_score(30, 80, 5, 0.5) == pytest.approx(6.5, rel=0.05)


# ── 2. Heatwave ──────────────────────────────────────────────────────────────

def test_heatwave_nagpur_day3():
    """Nagpur day 3 at 44°C → moderate 3.0."""
    assert heatwave_score(44, 40, 3, 30, 15, 2000) == pytest.approx(3.0, rel=0.05)


def test_heatwave_nagpur_day5():
    """Nagpur day 5 at 47°C → severe 8.8."""
    assert heatwave_score(47, 40, 5, 30, 15, 2000) == pytest.approx(8.8, rel=0.05)


# ── 3. Drought ────────────────────────────────────────────────────────────────

def test_heat_threshold_smooth_has_no_cliff():
    assert heat_threshold_smooth(200, 1e6) == 40.0
    assert heat_threshold_smooth(200, 10000) == 37.0
    assert heat_threshold_smooth(2000, 1e6) == 30.0
    # plateau just above 800 m stays hot (old rule jumped 40 -> 30 here)
    assert 36.0 < heat_threshold_smooth(850, 1e6) < 38.5
    assert abs(heat_threshold_smooth(801, 1e6) - heat_threshold_smooth(799, 1e6)) < 0.05


def test_flood_occurrence_month():
    assert flood_occurrence_month(0) == 0.0
    assert flood_occurrence_month(1.0) == pytest.approx(1 - math.exp(-1))
    assert flood_occurrence_month(5.0) > 0.99
    assert flood_occurrence_month(1.0, warming_c=2.0) > flood_occurrence_month(1.0)


def test_ponding_modifier_is_bounded():
    assert pluvial_ponding_modifier(0, 0, 100) == pytest.approx(0.5)     # steep, rural, sandy
    assert pluvial_ponding_modifier(100, 100, 0) == pytest.approx(1.5)   # flat, built, clay
    assert pluvial_ponding_modifier(50, 0, 50) == pytest.approx(0.5 + 0.25 + 0.1)


def test_flood_hazard_seasonal_pluvial_and_riverine():
    m = pluvial_ponding_modifier(40, 0, 0)  # 0.9
    # 50 mm 10-yr rain -> IMD base 5.0; 1 heavy day/month -> occurrence 1-1/e
    assert flood_hazard_seasonal(50, 0, 0, 40, 0, 1.0, 0.5) == pytest.approx(5.0 * m * (1 - math.exp(-1)))
    # riverine dominates when floodplain is large: 80 % x share 1.0 -> 8
    assert flood_hazard_seasonal(50, 0, 0, 40, 80, 1.0, 1.0) == pytest.approx(8.0)
    # dry month (no heavy days, no season share) -> nothing, even with a floodplain
    assert flood_hazard_seasonal(50, 0, 0, 40, 80, 0.0, 0.0) == 0.0
    # warming raises the score and it never reaches 10
    base = flood_hazard_seasonal(50, 0, 0, 40, 0, 1.0, 0.5)
    assert flood_hazard_seasonal(50, 0, 0, 40, 0, 1.0, 0.5, warming_c=2.0) > base
    assert flood_hazard_seasonal(300, 0, 100, 100, 100, 5.0, 1.0, warming_c=4.0) < 10.0


def test_gamma_quantile_ratio_matches_exact_gamma():
    # exact gamma(k=1/cv^2, scale=cv^2) 10th percentile / mean, from scipy.stats.gamma.ppf
    for cv, exact in [(0.15, 0.8132), (0.3, 0.6399), (0.45, 0.4838), (0.6, 0.3484)]:
        assert gamma_quantile_ratio(cv) == pytest.approx(exact, abs=0.002)
    assert gamma_quantile_ratio(0) == 1.0
    assert gamma_quantile_ratio(3.0) < 0.001        # extremely variable: 1-in-10 window ~ dry


def test_drought_hazard_seasonal():
    # cv 0.3 -> ratio 0.640 -> shortfall 0.36 -> 10*0.36/(2/3) = 5.4 ; full relevance
    assert drought_hazard_seasonal(0.3, 0.25, 0.25) == pytest.approx(5.4, abs=0.02)
    # a window carrying a quarter of the wettest window's rain counts a quarter
    assert drought_hazard_seasonal(0.3, 0.0625, 0.25) == pytest.approx(1.35, abs=0.01)
    # steady rainfall and no rain season -> no hazard
    assert drought_hazard_seasonal(0.0, 0.3, 0.3) == 0.0
    assert drought_hazard_seasonal(0.3, 0.0, 0.3) == 0.0
    assert drought_hazard_seasonal(0.3, 0.2, 0.0) == 0.0
    # more variable climates score higher; warming raises it; never reaches 10
    assert drought_hazard_seasonal(0.5, 0.25, 0.25) > drought_hazard_seasonal(0.2, 0.25, 0.25)
    assert drought_hazard_seasonal(0.3, 0.25, 0.25, warming_c=2.0) > drought_hazard_seasonal(0.3, 0.25, 0.25)
    assert drought_hazard_seasonal(2.0, 0.5, 0.5, warming_c=4.0) < 10.0


def test_rh_from_dewpoint():
    assert rh_from_dewpoint(25, 25) == pytest.approx(100.0)
    assert rh_from_dewpoint(30, 20) == pytest.approx(54.8, abs=1.0)   # standard psychrometric value
    assert rh_from_dewpoint(30, 35) == pytest.approx(100.0)           # dewpoint capped at air temp


def test_wet_bulb_hazard_seasonal():
    # cool or dry -> below the 28 C wet-bulb floor -> 0
    assert wet_bulb_hazard_seasonal(30, 10) == 0.0
    # hot and humid: T=36, Td=26 -> mean-state Tw, +2 C hot day, 28->35 C mapping
    twb = wet_bulb_temp(36, rh_from_dewpoint(36, 26)) + 2.0
    assert wet_bulb_hazard_seasonal(36, 26) == pytest.approx(max(0, (twb - 28) * 10 / 7), abs=0.02)
    # warming shifts temperature at constant RH
    twb2 = wet_bulb_temp(38, rh_from_dewpoint(36, 26)) + 2.0
    assert wet_bulb_hazard_seasonal(36, 26, warming_c=2.0) == pytest.approx(max(0, (twb2 - 28) * 10 / 7), abs=0.02)
    # more humid / more warming -> higher; never reaches 10
    assert wet_bulb_hazard_seasonal(36, 28) > wet_bulb_hazard_seasonal(36, 26)
    assert wet_bulb_hazard_seasonal(36, 26, warming_c=2.0) > wet_bulb_hazard_seasonal(36, 26)
    assert wet_bulb_hazard_seasonal(42, 31, warming_c=4.0) < 10.0


def test_landslide_susceptibility():
    assert landslide_susceptibility(5, 0.0) == 0.0
    assert landslide_susceptibility(3, 0.0) == 0.0
    assert landslide_susceptibility(15, 0.0) == pytest.approx(1 - math.exp(-1), abs=1e-9)   # 0.632
    assert landslide_susceptibility(15, 0.6) == pytest.approx((1 - math.exp(-1)) * 0.5, abs=1e-9)
    assert landslide_susceptibility(30, 0.2) > landslide_susceptibility(10, 0.2)


def test_landslide_hazard_follows_rain():
    wet = landslide_hazard_seasonal(15, 0.0, 150, 5.0)   # trigger 1 x (1 - e^-5)
    assert wet == pytest.approx(10 * (1 - math.exp(-1)) * (1 - math.exp(-5)), abs=0.02)
    assert landslide_hazard_seasonal(15, 0.0, 150, 0.0) == 0.0          # no heavy-rain days -> no trigger
    assert landslide_hazard_seasonal(15, 0.0, 20, 5.0) < 2.0            # dry hills (Leh): weak trigger
    assert landslide_hazard_seasonal(15, 0.0, 100, 1.0, warming_c=3.0) > landslide_hazard_seasonal(15, 0.0, 100, 1.0)
    assert landslide_hazard_seasonal(40, 0.0, 300, 20.0, warming_c=4.0) < 10.0


def test_rain_trigger_month_bounds():
    assert rain_trigger_month(300, 50, 0, 150) <= 1.0
    assert rain_trigger_month(0, 5, 0, 150) == 0.0


def test_flash_flood():
    # flat ground never flash-floods; steeper, barer, clayier, closer-to-channel scores higher
    assert flash_flood_susceptibility(0.0, 50, 0, 0.0, 0) == 0.0
    base = flash_flood_susceptibility(6, 5, 50, 0.4, 5000)
    assert flash_flood_susceptibility(12, 5, 50, 0.4, 5000) > base
    assert flash_flood_susceptibility(6, 5, 50, 0.4, 500) > base
    assert flash_flood_susceptibility(6, 5, 50, 0.1, 5000) > base
    # slope 15, bare clay, built 100, at the channel: 0.35 + 0.25*(0.5+0.5) + 0.2 + 0.2 = 1.0
    assert flash_flood_susceptibility(15, 100, 0, 0.0, 0) == pytest.approx(1.0)
    assert flash_flood_hazard_seasonal(15, 100, 0, 0.0, 0, 100, 0.0) == 0.0     # no rain trigger
    assert flash_flood_hazard_seasonal(15, 100, 0, 0.0, 0, 100, 5.0) > 9.0


def test_cold_wave():
    assert cold_threshold_smooth(200) == 10.0 and cold_threshold_smooth(2000) == 0.0
    assert abs(cold_threshold_smooth(801) - cold_threshold_smooth(799)) < 0.05          # no cliff
    # plains: tmin 12.5 -> cold night 8.0 -> 2 C below the 10 C threshold -> 2.0
    assert coldwave_hazard_seasonal(12.5, 200) == pytest.approx(2.0)
    assert coldwave_hazard_seasonal(14.5, 200) == 0.0
    # hills (2000 m): threshold 0; tmin -2 -> cold night -6.5 -> 6.5
    assert coldwave_hazard_seasonal(-2.0, 2000) == pytest.approx(6.5)
    # warming reduces cold-wave hazard; never above 10
    assert coldwave_hazard_seasonal(8, 200, warming_c=2.0) < coldwave_hazard_seasonal(8, 200)
    assert coldwave_hazard_seasonal(-30, 4000) < 10.0


def test_wet_bulb_best_hour_not_hottest_hour():
    # Regression (audit 20 Oct 2026): the warmest hour can be the drier one.
    warm_dry, cool_humid = (36.0, 22.0), (34.0, 27.0)
    a, b = wet_bulb_hazard_seasonal(*warm_dry), wet_bulb_hazard_seasonal(*cool_humid)
    assert a == pytest.approx(0.433, abs=0.01) and b == pytest.approx(4.012, abs=0.01)
    assert wet_bulb_hazard_best_hour([warm_dry, cool_humid]) == pytest.approx(b)
    assert wet_bulb_hazard_best_hour([cool_humid, warm_dry]) == pytest.approx(b)   # order-independent
    assert wet_bulb_hazard_best_hour([warm_dry], 1.0) == wet_bulb_hazard_seasonal(*warm_dry, 1.0)


def test_ehf_hand_computed():
    # T3 = 35, T95 = 32, T30 = 30 -> sig 3, accl 5 -> 15
    assert excess_heat_factor([34, 35, 36], 32, 30) == pytest.approx(15.0)
    # acclimatised (accl < 1) -> floored at 1
    assert excess_heat_factor([34, 35, 36], 32, 34.8) == pytest.approx(3.0)
    # below T95 -> negative (no heatwave)
    assert excess_heat_factor([28, 29, 30], 32, 27) < 0


def test_ehf_score_bands():
    assert ehf_score(-1, 10) == 0
    assert ehf_score(10, 10) == pytest.approx(5.0)       # severe threshold
    assert 8 < ehf_score(30, 10) < 9.5                    # extreme (3x)
    assert ehf_score(5, 10) < ehf_score(10, 10) < ehf_score(30, 10) < 10


def test_heatwave_warming_raises_score():
    base = heatwave_score(44, 40, 3, 30, 15, 2000)
    assert heatwave_score(44, 40, 3, 30, 15, 2000, warming_c=2.0) > base
    assert heatwave_score(44, 40, 3, 30, 15, 2000, warming_c=0.0) == base


def test_heatwave_soft_cap_keeps_rank_under_warming():
    a = heatwave_score(47, 40, 5, 60, 5, 500, warming_c=3.0)
    b = heatwave_score(47, 40, 5, 20, 5, 500, warming_c=3.0)
    assert a < 10 and b < 10 and a > b  # no flat clipping at 10


def test_drought_latur():
    """Latur 2016: SPI = -1.07 → 5.4."""
    assert drought_score(-1.07) == pytest.approx(5.4, rel=0.05)


def test_drought_normal():
    """Normal year: positive SPI → 0 (no drought)."""
    assert drought_score(0.14) == 0.0


# ── 4. Wet bulb temperature ──────────────────────────────────────────────────

def test_wet_bulb_temp_kolkata():
    """Kolkata: 38°C, 80% RH → T_wb ≈ 34.8°C.
    Note: formula_book.md worked example says ≈33.4 but the intermediate
    values (38×0.960 + 1.562 − 1.558 + 2.803×1.075 − 4.686) actually sum
    to 34.81. The formula is correct per Stull (2011); the book has an
    arithmetic typo in the final answer."""
    assert wet_bulb_temp(38, 80) == pytest.approx(34.81, abs=0.5)


# ── 5. Wet bulb score ────────────────────────────────────────────────────────

def test_wet_bulb_score_kolkata():
    """Kolkata humid heat → 9.7 (corrected from formula_book.md's 7.7,
    which was based on the erroneous T_wb ≈ 33.4 instead of 34.81)."""
    assert wet_bulb_score(38, 80) == pytest.approx(9.73, rel=0.05)


def test_wet_bulb_score_jaisalmer():
    """Jaisalmer dry heat: 46°C but 15% RH → 0 (body can cool)."""
    assert wet_bulb_score(46, 15) == 0.0


# ── 6. Exposure ──────────────────────────────────────────────────────────────

def test_exposure_bandra():
    """Bandra (Mumbai): dense urban → capped at 10."""
    assert exposure_score(50000, 9, 8, 26) == pytest.approx(10.0, rel=0.05)


def test_exposure_ladakh():
    """Ladakh village: small population → 6.8."""
    assert exposure_score(500, 7, 11, 24) == pytest.approx(6.8, rel=0.05)


# ── 7. Flood sensitivity ─────────────────────────────────────────────────────

def test_flood_sensitivity_patna():
    """Patna: flat, clay, built-up, near river → 0.74."""
    assert flood_sensitivity(0.5, 25, 65, 1500) == pytest.approx(0.74, rel=0.05)


def test_flood_sensitivity_wayanad():
    """Wayanad: sloped, sandy, rural, far from water → 0.33."""
    assert flood_sensitivity(18, 45, 8, 4000) == pytest.approx(0.33, rel=0.05)


# ── 8. Adaptive capacity ─────────────────────────────────────────────────────

def test_adaptive_capacity_mumbai():
    """Mumbai Suburban: high services → 0.93."""
    assert adaptive_capacity(99, 92, 88, 99, 9, 90) == pytest.approx(0.93, rel=0.05)


def test_adaptive_capacity_madhepura():
    """Madhepura (Bihar): moderate-low → 0.55."""
    assert adaptive_capacity(76, 32, 41, 78, 51, 53) == pytest.approx(0.55, rel=0.05)


# ── 9. End-to-end risk ───────────────────────────────────────────────────────

def test_compute_risk_patna():
    """Patna flood + cascade amplifier. AC dampening at H=8: max(0.2, 1-8/12)=0.333."""
    risk = compute_risk(
        hazard_score=8.0,
        exposure=9.0,
        sensitivity=0.74,
        ac=0.55,
        cascade_amplifiers=1.5,
    )
    # With AC dampening: effective_ac = 0.55 × 0.333 = 0.183
    # risk = (8×9×0.74) × (1-0.183) / 10 + 1.5 = 53.28 × 0.817 / 10 + 1.5 = 5.85
    assert risk == pytest.approx(5.85, rel=0.10)


# ── Air pollution ─────────────────────────────────────────────────────────────

def test_pollution_who_guideline():
    assert air_pollution_score(5) == pytest.approx(1.0, rel=0.05)

def test_pollution_naaqs():
    assert air_pollution_score(40) == pytest.approx(7.67, rel=0.05)

def test_pollution_delhi_winter():
    assert air_pollution_score(110) == 10.0

def test_pollution_zero():
    assert air_pollution_score(0) == 0.0
