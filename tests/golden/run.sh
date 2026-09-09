#!/usr/bin/env bash
# Single-command entry point for the golden parity test between
# scripts/risk/formulas.py and client/src/lib/simulatorFormulas.ts.
# Re-run this before any change to either file.
#
# Usage: bash tests/golden/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "[1/3] Python side (also writes hexes_with_scenario.json for the TS side)..."
python3 tests/golden/run_py_side.py

echo "[2/3] TS side..."
npx tsx tests/golden/run_ts_side.ts

echo "[3/3] Comparing..."
python3 tests/golden/compare.py
