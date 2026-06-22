"""Tests for multi-hazard counting and demographic aggregation (CCRR 2026)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from risk.multi_hazard import (
    breakdown_by_hazard_count,
    hazards_triggered,
    multi_hazard_count,
    multi_hazard_intensity,
    people_at_exactly_k_hazards,
    people_at_k_or_more_hazards,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

PATNA_HEX = {
    "h3_id": "hex_patna_urban",
    "pop_total": 50000,
    "pop_children_under_5": 4500,
    "pop_elderly_60plus": 3500,
    "hazards": {"flood": 7.0, "heat": 6.0, "drought": 4.0, "wet_bulb": 5.0},
}
BIKRAM_HEX = {
    "h3_id": "hex_bikram_rural",
    "pop_total": 3000,
    "pop_children_under_5": 420,
    "pop_elderly_60plus": 150,
    "hazards": {"flood": 2.0, "heat": 3.0, "drought": 6.0, "wet_bulb": 1.0},
}
COASTAL_HEX = {
    "h3_id": "hex_coastal",
    "pop_total": 8000,
    "pop_children_under_5": 1000,
    "pop_elderly_60plus": 600,
    "hazards": {"flood": 6.0, "heat": 4.0, "drought": 2.0, "cyclone": 8.0},
}
ALL_HEXES = [PATNA_HEX, BIKRAM_HEX, COASTAL_HEX]


# ── multi_hazard_count ────────────────────────────────────────────────────────

def test_count_patna():
    assert multi_hazard_count(PATNA_HEX["hazards"]) == 3

def test_count_bikram():
    assert multi_hazard_count(BIKRAM_HEX["hazards"]) == 1

def test_count_coastal():
    assert multi_hazard_count(COASTAL_HEX["hazards"]) == 2

def test_count_empty():
    assert multi_hazard_count({}, threshold=5.0) == 0

def test_count_below_threshold():
    assert multi_hazard_count({"flood": 4.99}, threshold=5.0) == 0

def test_count_at_threshold():
    assert multi_hazard_count({"flood": 5.0}, threshold=5.0) == 1


# ── hazards_triggered ─────────────────────────────────────────────────────────

def test_triggered_patna():
    assert hazards_triggered(PATNA_HEX["hazards"]) == ["flood", "heat", "wet_bulb"]

def test_triggered_bikram():
    assert hazards_triggered(BIKRAM_HEX["hazards"]) == ["drought"]

def test_triggered_coastal():
    assert hazards_triggered(COASTAL_HEX["hazards"]) == ["cyclone", "flood"]

def test_triggered_empty():
    assert hazards_triggered({}) == []


# ── multi_hazard_intensity ────────────────────────────────────────────────────

def test_intensity_patna():
    assert multi_hazard_intensity(PATNA_HEX["hazards"]) == 7.0

def test_intensity_bikram():
    assert multi_hazard_intensity(BIKRAM_HEX["hazards"]) == 6.0

def test_intensity_coastal():
    assert multi_hazard_intensity(COASTAL_HEX["hazards"]) == 8.0

def test_intensity_empty():
    assert multi_hazard_intensity({}) == 0.0


# ── people_at_exactly_k_hazards (children under 5) ───────────────────────────

def test_exactly_0():
    assert people_at_exactly_k_hazards(ALL_HEXES, "pop_children_under_5", 0) == 0

def test_exactly_1():
    assert people_at_exactly_k_hazards(ALL_HEXES, "pop_children_under_5", 1) == 420

def test_exactly_2():
    assert people_at_exactly_k_hazards(ALL_HEXES, "pop_children_under_5", 2) == 1000

def test_exactly_3():
    assert people_at_exactly_k_hazards(ALL_HEXES, "pop_children_under_5", 3) == 4500

def test_exactly_4():
    assert people_at_exactly_k_hazards(ALL_HEXES, "pop_children_under_5", 4) == 0


# ── people_at_k_or_more_hazards (children under 5) ───────────────────────────

def test_k_or_more_children_1():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_children_under_5", 1) == 5920

def test_k_or_more_children_2():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_children_under_5", 2) == 5500

def test_k_or_more_children_3():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_children_under_5", 3) == 4500

def test_k_or_more_children_4():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_children_under_5", 4) == 0


# ── people_at_k_or_more_hazards (elderly) ─────────────────────────────────────

def test_k_or_more_elderly_1():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_elderly_60plus", 1) == 4250

def test_k_or_more_elderly_2():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_elderly_60plus", 2) == 4100

def test_k_or_more_elderly_3():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_elderly_60plus", 3) == 3500


# ── people_at_k_or_more_hazards (total population) ───────────────────────────

def test_k_or_more_total_1():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_total", 1) == 61000

def test_k_or_more_total_2():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_total", 2) == 58000

def test_k_or_more_total_3():
    assert people_at_k_or_more_hazards(ALL_HEXES, "pop_total", 3) == 50000


# ── breakdown_by_hazard_count ─────────────────────────────────────────────────

def test_breakdown():
    breakdown = breakdown_by_hazard_count(ALL_HEXES, "pop_total")
    assert breakdown == {0: 0, 1: 3000, 2: 8000, 3: 50000}
    assert sum(breakdown.values()) == 61000


# ── Threshold tunability ──────────────────────────────────────────────────────

def test_threshold_high():
    assert multi_hazard_count(PATNA_HEX["hazards"], threshold=7.0) == 1

def test_threshold_low():
    assert multi_hazard_count(PATNA_HEX["hazards"], threshold=3.0) == 4
