"""Layer C -- compound multi-hazard aggregation.

    H_d = sum_h w_h H*_h  +  sum_{h<h'} lambda_{hh'} H*_h H*_h'

The pairwise interaction term is the compound risk that single-hazard tools
miss (e.g. drought x heat amplification). Weights w and the interaction matrix
lambda are CALIBRATED coefficients -- see config.py / calibration.
"""
from __future__ import annotations
from typing import Mapping, Tuple


def compound_hazard(hazards: Mapping[str, float],
                    weights: Mapping[str, float],
                    interaction: Mapping[Tuple[str, str], float]) -> float:
    """Combine per-hazard effective values into a single (un-normalised) score.

    hazards:     {hazard_name: effective_hazard_value}
    weights:     {hazard_name: w_h}
    interaction: {(name_a, name_b): lambda_{ab}}  -- order-insensitive lookup

    Returns the raw compound hazard; normalise it to [0,1] before the risk
    identity (see normalize.normalize with calibrated lo/hi bounds).
    """
    names = list(hazards)
    for h in names:
        if h not in weights:
            raise KeyError(f"missing weight for hazard '{h}'")
    total = sum(weights[h] * hazards[h] for h in names)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            lam = interaction.get((a, b), interaction.get((b, a), 0.0))
            total += lam * hazards[a] * hazards[b]
    return total
