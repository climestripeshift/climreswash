"""Layer D -- the DRR risk identity.

    R_d = ( H_hat_d * E_d * V_d * (1 - C_d) ) ^ (1/4)

INFORM-compatible geometric mean. Mapping to INFORM dimensions:
    (H_hat, E) <-> Hazard & Exposure
    V          <-> Vulnerability
    (1 - C)    <-> Lack of Coping Capacity

Dimension composites (E, V, C) are built in dimensions.composite().
"""
from __future__ import annotations

from .normalize import geometric_mean


def district_risk(hazard_norm: float, exposure: float,
                  vulnerability: float, capacity: float) -> float:
    """The DRR risk identity. All four inputs must be in [0,1].

    Capacity enters as (1 - C): higher coping/adaptive capacity lowers risk.
    A near-zero in any pillar collapses risk -- intended DRR behaviour.
    """
    for name, v in (("hazard_norm", hazard_norm), ("exposure", exposure),
                    ("vulnerability", vulnerability), ("capacity", capacity)):
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"{name} must be in [0,1], got {v}")
    return geometric_mean([hazard_norm, exposure, vulnerability, 1.0 - capacity])
