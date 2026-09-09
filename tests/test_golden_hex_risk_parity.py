"""Golden parity test: scripts/risk/formulas.py vs client/src/lib/simulatorFormulas.ts.

Runs the full tests/golden/ pipeline (Python side -> TS side -> compare) as a
subprocess and asserts on the hard regression gates (Tier 1 formula parity +
Tier 2a adaptive_capacity parity). Tier 2b (per-channel risk on real hexes) is
a known, pre-existing divergence -- see tests/golden/compare.py's docstring --
and is printed for visibility but does not fail this test.

Discovered by `pytest tests/` per this repo's existing pytest.ini convention.
NOTE (see chat): this repo's only GitHub Actions workflow
(.github/workflows/refresh-forecast.yml) runs compute_forecast.py on a daily
cron, not pytest -- there is currently no CI that runs this (or any other)
test on push/PR. Flagged to the user; not added here without being asked.

Run standalone: pytest tests/test_golden_hex_risk_parity.py -v -s
Or directly:    bash tests/golden/run.sh
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "tests" / "golden"


def _run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, **kw)


def test_golden_hex_risk_parity():
    py = _run([sys.executable, str(GOLDEN / "run_py_side.py")])
    assert py.returncode == 0, f"Python side failed:\n{py.stdout}\n{py.stderr}"

    ts = _run(["npx", "tsx", str(GOLDEN / "run_ts_side.ts")])
    assert ts.returncode == 0, f"TS side failed:\n{ts.stdout}\n{ts.stderr}"

    cmp = _run([sys.executable, str(GOLDEN / "compare.py")])
    print(cmp.stdout)  # always show the full report (pytest -s), pass or fail
    if cmp.returncode != 0:
        print(cmp.stderr, file=sys.stderr)
    assert cmp.returncode == 0, (
        "Golden parity regression gate tripped (Tier 1 formula parity and/or "
        "Tier 2a adaptive_capacity parity) -- see printed report above for "
        "which vectors/hexes mismatched."
    )


if __name__ == "__main__":
    test_golden_hex_risk_parity()
    print("OK")
