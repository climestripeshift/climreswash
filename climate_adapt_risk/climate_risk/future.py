"""Layer F -- forward / scenario dynamics.

Two mechanisms:
  1. Carry-over (stock-flow): buffers persist across seasons, so a depleted year
     compounds the next deficit. The updated buffer feeds back into Layer B.
  2. Irreversibility: a fraction phi of impact is permanent (child stunting,
     asset loss); only the remainder recovers, at a rate proportional to
     adaptive capacity.
"""
from __future__ import annotations
from typing import Iterable


def carryover(buffer_prev: float, recharge: float, draw: float) -> float:
    """B_t = max(0, B_{t-1} + recharge - draw).

    Returns the buffer carried into the next period; feed it into Layer B's
    surface_storage / groundwater terms for the next season's run.
    """
    return max(0.0, buffer_prev + recharge - draw)


def cumulative_loss(impacts: Iterable[float], phi: float, recovery_rate: float) -> float:
    """L = sum_t [ phi*Impact_t + (1-phi)*(1-rho)*Impact_t ].

    phi:           irreversible fraction in [0,1] (CALIBRATED; see config).
    recovery_rate: rho in [0,1], proportional to adaptive capacity.
    """
    if not 0.0 <= phi <= 1.0:
        raise ValueError("phi must be in [0,1]")
    if not 0.0 <= recovery_rate <= 1.0:
        raise ValueError("recovery_rate must be in [0,1]")
    total = 0.0
    for imp in impacts:
        total += phi * imp + (1.0 - phi) * (1.0 - recovery_rate) * imp
    return total
