"""Tests for the deterministic math. These also serve as executable
documentation of the methodology insights (soil sign-flip, buffer, compound
interaction, geometric-mean collapse, carry-over).
"""
from climate_risk.hazard import effective_drought_stress, effective_flood_runoff
from climate_risk.compound import compound_hazard
from climate_risk.risk import district_risk
from climate_risk.impact import impact_people
from climate_risk.future import carryover, cumulative_loss
from climate_risk.normalize import geometric_mean, normalize


def test_buffer_lowers_drought_stress():
    """'Less rainfall but good water, fine for the year': more buffer => less stress."""
    high_buffer = effective_drought_stress(50, soil_capacity=20, surface_storage=100, groundwater=80)
    low_buffer = effective_drought_stress(50, soil_capacity=20, surface_storage=0, groundwater=0)
    assert high_buffer < low_buffer


def test_soil_sign_flip():
    """Sandy soil lowers flood runoff but raises drought stress; clay is the reverse.
    One conditioner, opposite effects across hazards.
    """
    sandy_flood = effective_flood_runoff(100, infiltration_capacity=0.8, slope_factor=1.0)
    clay_flood = effective_flood_runoff(100, infiltration_capacity=0.2, slope_factor=1.0)
    sandy_drought = effective_drought_stress(100, soil_capacity=5, surface_storage=10, groundwater=10)
    clay_drought = effective_drought_stress(100, soil_capacity=30, surface_storage=10, groundwater=10)
    assert sandy_flood < clay_flood
    assert sandy_drought > clay_drought


def test_compound_interaction_amplifies():
    """A positive interaction term raises compound hazard above the additive sum."""
    hazards = {"drought": 0.6, "heat": 0.5}
    weights = {"drought": 0.5, "heat": 0.5}
    additive = compound_hazard(hazards, weights, interaction={})
    amplified = compound_hazard(hazards, weights, interaction={("drought", "heat"): 0.5})
    assert amplified > additive


def test_interaction_lookup_is_order_insensitive():
    hazards = {"drought": 0.6, "heat": 0.5}
    weights = {"drought": 0.5, "heat": 0.5}
    a = compound_hazard(hazards, weights, {("drought", "heat"): 0.4})
    b = compound_hazard(hazards, weights, {("heat", "drought"): 0.4})
    assert abs(a - b) < 1e-12


def test_risk_collapses_when_a_pillar_is_zero():
    """No exposure => no risk, regardless of hazard/vulnerability."""
    full = district_risk(1.0, 1.0, 1.0, 0.0)
    no_exposure = district_risk(1.0, 0.0, 1.0, 0.0)
    assert abs(full - 1.0) < 1e-6
    # fourth root softens but still collapses risk by ~180x vs full
    assert no_exposure < full * 0.01


def test_capacity_reduces_risk():
    low_cap = district_risk(0.8, 0.8, 0.8, 0.1)
    high_cap = district_risk(0.8, 0.8, 0.8, 0.9)
    assert high_cap < low_cap


def test_carryover_depletion_compounds():
    """A buffer drawn down below recharge carries less (or nothing) into next season."""
    assert carryover(buffer_prev=10, recharge=5, draw=20) == 0.0
    assert carryover(buffer_prev=100, recharge=30, draw=20) == 110.0


def test_cumulative_loss_irreversibility():
    """Higher irreversible fraction => higher cumulative loss for the same impacts."""
    impacts = [10.0, 10.0, 10.0]
    reversible = cumulative_loss(impacts, phi=0.0, recovery_rate=0.9)
    permanent = cumulative_loss(impacts, phi=1.0, recovery_rate=0.9)
    assert permanent > reversible


def test_impact_people_scales_with_risk_and_population():
    assert impact_people(0.5, 1000, 1.0) == 500.0
    assert impact_people(0.0, 1000, 1.0) == 0.0


def test_normalize_direction_of_effect():
    """invert=True flips capacity-type indicators so higher always = more risk."""
    assert normalize(75, 0, 100) == 0.75
    assert normalize(75, 0, 100, invert=True) == 0.25


def test_geometric_mean_weighted():
    assert abs(geometric_mean([0.25, 1.0], [1, 1]) - 0.5) < 1e-9
