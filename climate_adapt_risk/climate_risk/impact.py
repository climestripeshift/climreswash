"""Layer E -- impact lenses.

The same district risk R_d is projected through different consequence functions.
Every impact MUST be reported as a DELTA versus baseline (the marginal people /
output pushed over a threshold by this event), not as an absolute level, and
disaggregated by district and by actor.

The kappa consequence factors are CALIBRATED against observed outcomes -- see
config.py. With placeholder kappa = 1.0 these return relative, not absolute,
impact and must not be presented as real counts.
"""
from __future__ import annotations


def impact_people(risk: float, child_population: float, kappa_welfare: float) -> float:
    """Impact_people = R * Pop_<18 * kappa_welfare  (report as delta vs baseline)."""
    return risk * child_population * kappa_welfare


def impact_livelihood(risk: float, exposed_output: float, kappa_income: float) -> float:
    """Impact_livelihood = R * Y_exposed * kappa_income  (report as delta vs baseline)."""
    return risk * exposed_output * kappa_income
