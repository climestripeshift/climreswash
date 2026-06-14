"""Deterministic helpers: normalisation and geometric-mean aggregation.

These functions contain NO domain coefficients and NO data assumptions, so they
are fully implemented and fully unit-tested. An agent may extend them but must
not change their semantics.
"""
from __future__ import annotations
from typing import Iterable, Sequence


def normalize(value: float, lo: float, hi: float, invert: bool = False) -> float:
    """Min-max normalise a raw indicator into [0, 1] with direction-of-effect.

    invert=True flips indicators where a HIGHER raw value means LOWER risk
    contribution (e.g. adaptive-capacity inputs like literacy or irrigation
    coverage), so that after normalisation, higher always means more
    risk-contributing. Apply this consistently before any aggregation.
    """
    if hi == lo:
        return 0.0
    x = (value - lo) / (hi - lo)
    x = max(0.0, min(1.0, x))
    return 1.0 - x if invert else x


def geometric_mean(values: Sequence[float], weights: Sequence[float] | None = None) -> float:
    """Weighted geometric mean of values in [0, 1].

    Used for the dimension composites (E, V, C) and the final risk identity.
    Chosen over an arithmetic mean because it is INFORM-compatible and because
    a near-zero in any single component correctly collapses the result, which
    is the intended DRR behaviour (no exposure => no risk, etc.).
    """
    values = list(values)
    if not values:
        raise ValueError("geometric_mean requires at least one value")
    if weights is None:
        weights = [1.0 / len(values)] * len(values)
    weights = list(weights)
    if len(weights) != len(values):
        raise ValueError("values and weights must be the same length")
    total_w = sum(weights)
    if total_w <= 0:
        raise ValueError("weights must sum to a positive number")
    weights = [w / total_w for w in weights]
    prod = 1.0
    for v, w in zip(values, weights):
        if v < 0.0 or v > 1.0:
            raise ValueError(f"geometric_mean inputs must be in [0,1], got {v}")
        prod *= max(v, 1e-9) ** w  # 1e-9 floor guards against log(0); a true 0 still collapses the product
    return prod
