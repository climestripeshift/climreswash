"""ClimateAdapt district risk engine -- DRR risk identity with ENSO forcing and
biophysical hazard mediation. See README.md for the formula-to-module map.
"""
from .normalize import normalize, geometric_mean
from .forcing import apply_teleconnection, fit_teleconnection
from .hazard import effective_drought_stress, effective_flood_runoff
from .compound import compound_hazard
from .dimensions import composite
from .risk import district_risk
from .impact import impact_people, impact_livelihood
from .future import carryover, cumulative_loss
from .pipeline import run_district
from .schemas import DistrictInputs, DistrictRisk
from . import config

__version__ = "0.1.0"

__all__ = [
    "normalize", "geometric_mean", "apply_teleconnection", "fit_teleconnection",
    "effective_drought_stress", "effective_flood_runoff", "compound_hazard",
    "composite", "district_risk", "impact_people", "impact_livelihood",
    "carryover", "cumulative_loss", "run_district",
    "DistrictInputs", "DistrictRisk", "config",
]
