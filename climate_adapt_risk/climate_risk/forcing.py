"""Layer A -- ENSO seasonal forcing of the hazard driver.

    X_{d,h,s} = baseline_{d,h} + beta_{d,h} * ONI_s + gamma_{d,h} * DMI_s

beta is the district teleconnection coefficient -- the quantified "imbalance"
between districts. It and gamma (the IOD/DMI interaction term) MUST be estimated
from historical data, never assumed.
"""
from __future__ import annotations
from typing import Any


def apply_teleconnection(baseline: float, beta: float, oni: float,
                         gamma: float = 0.0, dmi: float = 0.0) -> float:
    """Apply already-fitted coefficients to get the forced driver value.

    This is pure arithmetic and is safe to use once beta/gamma are calibrated.
    It does NOT estimate the coefficients -- see fit_teleconnection.
    """
    return baseline + beta * oni + gamma * dmi


def fit_teleconnection(history: Any) -> dict:
    """Estimate (beta, gamma) per district by regressing historical district
    seasonal rainfall / temperature anomalies on the ONI and DMI indices.

    NOT IMPLEMENTED ON PURPOSE.

    These coefficients are the empirical core of the imbalance and MUST come
    from data. Implement with an OLS / robust regression (statsmodels or
    numpy.linalg.lstsq) over >= 30 years of district-by-season records, then
    persist per district+hazard. Do NOT hardcode or guess values to make the
    pipeline run.
    """
    raise NotImplementedError(
        "fit_teleconnection must be implemented against real historical data "
        "(>=30 years, district-season rainfall/temperature vs ONI & DMI). "
        "Do NOT substitute placeholder coefficients."
    )
