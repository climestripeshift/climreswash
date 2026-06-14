"""Tests for the anti-fabrication guards: the coefficient-fit stub must refuse
to run, and the pipeline must refuse uncalibrated production output.
"""
import pytest

from climate_risk import config
from climate_risk.forcing import fit_teleconnection
from climate_risk.pipeline import run_district
from climate_risk.schemas import DistrictInputs


def _smoke_input():
    return DistrictInputs(
        name="TEST", oni=1.5, dmi=0.0,
        drought_baseline_deficit=80, drought_beta=10, drought_gamma=0,
        flood_baseline_rain=50, flood_beta=-5, flood_gamma=0,
        soil_capacity=10, surface_storage=20, groundwater=20,
        infiltration=0.5, slope_factor=1.0, heat_hazard_norm=0.6,
        exposure=0.7, vulnerability=0.6, capacity=0.3,
        child_population=120000, exposed_output=5000,
    )


def test_fit_teleconnection_refuses_to_guess():
    with pytest.raises(NotImplementedError):
        fit_teleconnection(history=None)


def test_pipeline_blocks_uncalibrated_production_run():
    assert config.CALIBRATED is False  # ships uncalibrated by design
    with pytest.raises(RuntimeError):
        run_district(_smoke_input())  # allow_uncalibrated defaults to False


def test_pipeline_smoke_runs_when_explicitly_allowed():
    """Explicit opt-in lets tests exercise the wiring with placeholder coeffs."""
    out = run_district(_smoke_input(), allow_uncalibrated=True)
    assert 0.0 <= out.risk <= 1.0
    assert out.calibrated is False  # output is flagged as not trustworthy
    assert out.effective_drought > 0
