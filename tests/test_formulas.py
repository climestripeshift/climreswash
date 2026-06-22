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
    pluvial_flood_score,
    wet_bulb_score,
    wet_bulb_temp,
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
