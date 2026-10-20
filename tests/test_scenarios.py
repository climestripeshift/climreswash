"""The scenario table is derived in code from AR6 SPM.1 numbers; pin the derivation."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "risk"))
from scenarios import (  # noqa: E402
    AR6_GSAT, BASELINE_GSAT_OFFSET_C, HOT_EXTREME_AMPLIFICATION, WARMING, combos, mean_warming,
)


def test_baseline_offset_interpolation():
    # 0.85 (1995-2014) and 0.99 (2001-2020) interpolated to the 1991-2020 midpoint
    assert BASELINE_GSAT_OFFSET_C == pytest.approx(0.87, abs=1e-9)


def test_spm_rows_unchanged():
    # Table SPM.1 best estimates (IPCC AR6 WG1 SPM)
    assert AR6_GSAT["ssp126"] == {"2030": 1.5, "2050": 1.7, "2080": 1.8}
    assert AR6_GSAT["ssp245"] == {"2030": 1.5, "2050": 2.0, "2080": 2.7}
    assert AR6_GSAT["ssp370"] == {"2030": 1.5, "2050": 2.1, "2080": 3.6}
    assert AR6_GSAT["ssp585"] == {"2030": 1.6, "2050": 2.4, "2080": 4.4}


@pytest.mark.parametrize("ssp,hz,mean,hot", [
    ("ssp126", "2030", 0.63, 0.8), ("ssp126", "2050", 0.83, 1.0), ("ssp126", "2080", 0.93, 1.1),
    ("ssp245", "2030", 0.63, 0.8), ("ssp245", "2050", 1.13, 1.4), ("ssp245", "2080", 1.83, 2.2),
    ("ssp370", "2030", 0.63, 0.8), ("ssp370", "2050", 1.23, 1.5), ("ssp370", "2080", 2.73, 3.3),
    ("ssp585", "2030", 0.73, 0.9), ("ssp585", "2050", 1.53, 1.8), ("ssp585", "2080", 3.53, 4.2),
])
def test_derived_values(ssp, hz, mean, hot):
    assert mean_warming(ssp, hz) == pytest.approx(mean, abs=1e-9)
    assert WARMING[ssp][hz] == pytest.approx(hot, abs=1e-9)
    assert WARMING[ssp][hz] == pytest.approx(round(mean * HOT_EXTREME_AMPLIFICATION, 1), abs=1e-9)


def test_combos_and_baseline():
    c = combos()
    assert c[0] == ("baseline", "1991-2020", 0.0) and len(c) == 13
    assert mean_warming("baseline", "2050") == 0.0
