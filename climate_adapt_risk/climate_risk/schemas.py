"""I/O contracts for the risk pipeline.

These dataclasses are the boundary an agent should wire data INTO and results
OUT OF. In production, populate DistrictInputs from a GeoDataFrame / PostGIS
query (one row per district-season); the math layers stay framework-agnostic.

All *_norm and exposure/vulnerability/capacity fields must already be in [0,1]
(produced upstream by normalize.normalize + dimensions.composite).
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class DistrictInputs:
    name: str
    # --- Layer A: ENSO forcing ---
    oni: float
    dmi: float
    # drought driver pieces (beta/gamma come from forcing.fit_teleconnection)
    drought_baseline_deficit: float
    drought_beta: float
    drought_gamma: float
    # flood driver pieces
    flood_baseline_rain: float
    flood_beta: float
    flood_gamma: float
    # --- Layer B: biophysical conditioners ---
    soil_capacity: float
    surface_storage: float
    groundwater: float
    infiltration: float           # in [0,1]
    slope_factor: float
    # heat enters as a normalised proxy here; replace with its own model later
    heat_hazard_norm: float       # in [0,1]
    # --- Layer D: dimension composites (already in [0,1]) ---
    exposure: float
    vulnerability: float
    capacity: float
    # --- Layer E exposure quantities (for impact deltas) ---
    child_population: float = 0.0
    exposed_output: float = 0.0


@dataclass
class DistrictRisk:
    name: str
    effective_drought: float
    effective_flood: float
    compound_hazard_raw: float
    hazard_norm: float
    risk: float
    impact_people: float
    impact_livelihood: float
    calibrated: bool
