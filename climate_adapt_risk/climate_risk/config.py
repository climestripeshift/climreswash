"""Coefficient configuration and the calibration guard.

EVERY numeric value in this file is a PLACEHOLDER. None is calibrated against
data. The pipeline refuses to run in production mode until CALIBRATED is set to
True by a human who has actually fit AND validated these coefficients.

Do NOT flip CALIBRATED to True just to make the pipeline run. Doing so ships a
model whose outputs look real but are scientifically meaningless.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Master guard. Leave False until coefficients are fit and validated (e.g.
# back-tested against the 2015-16 super El Nino with observed loss data).
# ---------------------------------------------------------------------------
CALIBRATED: bool = False

# --- PLACEHOLDER coefficients (sentinel values, NOT evidence-based) ---------
# Layer C: hazard weights w_h  -- TODO calibrate (PCA on loss data / expert elicitation)
HAZARD_WEIGHTS: dict[str, float] = {
    "drought": 1 / 3,
    "flood": 1 / 3,
    "heat": 1 / 3,
}

# Layer C: interaction matrix lambda_{hh'}  -- TODO calibrate
# Placeholder zeros => model behaves additively until interactions are estimated.
INTERACTION_MATRIX: dict[tuple[str, str], float] = {
    ("drought", "heat"): 0.0,
    ("flood", "heat"): 0.0,
    ("drought", "flood"): 0.0,
}

# Layer F: irreversible fraction phi  -- TODO calibrate (stunting / asset-loss studies)
PHI_IRREVERSIBLE: float = 0.0

# Layer E: consequence factors kappa  -- TODO calibrate vs observed outcomes
KAPPA_WELFARE: float = 1.0   # placeholder => returns RELATIVE, not absolute, impact
KAPPA_INCOME: float = 1.0    # placeholder => returns RELATIVE, not absolute, impact

# Hazard normalisation bounds (lo, hi) for mapping raw compound hazard to [0,1]
# -- TODO set from the observed district distribution, not guessed.
COMPOUND_HAZARD_BOUNDS: tuple[float, float] = (0.0, 1.0)


def require_calibrated() -> None:
    """Raise unless coefficients have been calibrated. Called by the pipeline."""
    if not CALIBRATED:
        raise RuntimeError(
            "Model coefficients are placeholders. Set CALIBRATED=True only after "
            "fitting AND validating them against historical loss data. Until then, "
            "run with allow_uncalibrated=True for tests/smoke runs only -- never "
            "present such outputs as real risk estimates."
        )
