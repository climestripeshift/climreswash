"""Pipeline orchestration: wires Layers A -> E for one district.

The math layers are pure functions; this module is the only place that knows the
order. It enforces the calibration guard so placeholder-coefficient output can
never be silently treated as real.
"""
from __future__ import annotations

from . import config
from .forcing import apply_teleconnection
from .hazard import effective_drought_stress, effective_flood_runoff
from .compound import compound_hazard
from .normalize import normalize
from .risk import district_risk
from .impact import impact_people, impact_livelihood
from .schemas import DistrictInputs, DistrictRisk


def run_district(inp: DistrictInputs, *, allow_uncalibrated: bool = False) -> DistrictRisk:
    """Compute risk + impact for a single district.

    Set allow_uncalibrated=True ONLY for tests/smoke runs using placeholder
    coefficients. In production leave it False so require_calibrated() blocks
    output until coefficients are fit and validated.
    """
    if not allow_uncalibrated:
        config.require_calibrated()

    # Layer A -- ENSO-forced drivers
    deficit = apply_teleconnection(
        inp.drought_baseline_deficit, inp.drought_beta, inp.oni, inp.drought_gamma, inp.dmi
    )
    rain = apply_teleconnection(
        inp.flood_baseline_rain, inp.flood_beta, inp.oni, inp.flood_gamma, inp.dmi
    )

    # Layer B -- effective (mediated) hazards
    eff_drought = effective_drought_stress(
        deficit, inp.soil_capacity, inp.surface_storage, inp.groundwater
    )
    eff_flood = effective_flood_runoff(rain, inp.infiltration, inp.slope_factor)

    # Layer C -- compound aggregation (heat passed in as a normalised proxy)
    hazards = {"drought": eff_drought, "flood": eff_flood, "heat": inp.heat_hazard_norm}
    raw = compound_hazard(hazards, config.HAZARD_WEIGHTS, config.INTERACTION_MATRIX)
    lo, hi = config.COMPOUND_HAZARD_BOUNDS
    hazard_norm = normalize(raw, lo, hi)

    # Layer D -- risk identity
    r = district_risk(hazard_norm, inp.exposure, inp.vulnerability, inp.capacity)

    # Layer E -- impact lenses (deltas; calibrate kappa before treating as counts)
    ip = impact_people(r, inp.child_population, config.KAPPA_WELFARE)
    il = impact_livelihood(r, inp.exposed_output, config.KAPPA_INCOME)

    return DistrictRisk(
        name=inp.name,
        effective_drought=eff_drought,
        effective_flood=eff_flood,
        compound_hazard_raw=raw,
        hazard_norm=hazard_norm,
        risk=r,
        impact_people=ip,
        impact_livelihood=il,
        calibrated=config.CALIBRATED,
    )
