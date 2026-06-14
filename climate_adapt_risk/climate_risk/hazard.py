"""Layer B -- effective (biophysically mediated) hazard.

Raw meteorological hazard is NOT risk. It becomes an effective hazard only
through local conditioners (soil, storage, slope). These functions encode the
transfer; they are deterministic given their inputs and fully implemented.
"""
from __future__ import annotations


def effective_drought_stress(deficit: float, soil_capacity: float,
                             surface_storage: float, groundwater: float) -> float:
    """H*_drought = D / (S + W + G)

    deficit (D):          forced rainfall deficit for the season (Layer A output)
    soil_capacity (S):    plant-available water-holding capacity of the soil
    surface_storage (W):  reservoir / tank / check-dam buffer
    groundwater (G):      usable groundwater stock

    A larger buffer lowers effective stress: this is the "less rainfall but good
    water, fine for the year" case. Buffer must be > 0.
    """
    buffer = soil_capacity + surface_storage + groundwater
    if buffer <= 0:
        raise ValueError("total water buffer (S + W + G) must be > 0")
    return deficit / buffer


def effective_flood_runoff(rain_intensity: float, infiltration_capacity: float,
                           slope_factor: float) -> float:
    """H*_flood = P * (1 - I) * slope

    rain_intensity (P):        forced rainfall intensity (Layer A output)
    infiltration_capacity (I): fraction in [0,1]; sandy soils are high
    slope_factor:              terrain runoff multiplier (>= 0)

    SIGN-FLIP NOTE: infiltration appears here as (1 - I) and in drought via the
    soil_capacity term. Sandy soil => high I => LOWER flood runoff, but also low
    soil_capacity => HIGHER drought stress. One conditioner, opposite effects
    across hazards -- the reason soil cannot live in a single additive index.
    """
    if not 0.0 <= infiltration_capacity <= 1.0:
        raise ValueError("infiltration_capacity must be in [0,1]")
    if slope_factor < 0:
        raise ValueError("slope_factor must be >= 0")
    return rain_intensity * (1.0 - infiltration_capacity) * slope_factor
