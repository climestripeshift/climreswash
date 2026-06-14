"""Layer D -- dimension composites (Exposure E, Vulnerability V, Capacity C).

Each dimension is a weighted geometric mean of its normalised sub-indicators
(from the indicator taxonomy). Inputs MUST already be in [0,1] with
direction-of-effect applied (see normalize.normalize). Sub-indicator weights
are calibrated (PCA / expert elicitation) -- see config.py.
"""
from __future__ import annotations
from typing import Sequence

from .normalize import geometric_mean


def composite(subindicators: Sequence[float],
              weights: Sequence[float] | None = None) -> float:
    """Aggregate normalised sub-indicators into one dimension score."""
    return geometric_mean(list(subindicators), weights)
