"""Diffs py_results.json against ts_results.json and reports golden-test
results. Two tiers, two different contracts:

TIER 1 (formula parity) -- pluvial_flood_score, heatwave_score, drought_score,
wet_bulb_score, exposure_score, flood_sensitivity, heat_sensitivity,
compute_risk. Same math, ported line-by-line, hex-independent numeric
vectors -- both engines MUST agree near-exactly. Tolerance: 1e-4 absolute
(tight enough to catch any real logic drift -- e.g. Bug 3's flood_sensitivity
slope clamp silently missing from one file -- while absorbing harmless
cross-language floating-point noise, e.g. Python's math.atan vs JS's
Math.atan differing in the last ULP). THIS IS THE REGRESSION GATE: exits
non-zero on any Tier-1 mismatch.

TIER 2 (hex-level, 25 real hexes, shared weather scenario) -- two different
contracts within Tier 2:
  (a) adaptive_capacity: both engines now resolve real per-hex AC with the
      same state-level fallback logic (this session's Fix A / simulator fix)
      -- should also match near-exactly. Tolerance: 0.01. Also a hard gate.
  (b) slope/dist_water/sand_pct/exposure_10/heat_threshold and everything
      downstream of them (sensitivity, hazard, risk): simulatorFormulas.ts's
      reScoreHex() does NOT read a hex's real slope_deg/dist_water_m/
      real_sand_pct (uses flat DEFAULT_SLOPE=3.0/DEFAULT_DIST_WATER=5000/
      land-use sand% instead) and uses real per-hex demographics for exposure
      where hex_risk.py uses a flat national assumption (9/8/25%) -- both
      pre-existing, found while building this test, not fixed here (out of
      Part 2 scope). These are REPORTED at the requested 0.1 tolerance but
      do NOT fail the run -- they are known, already-diverging-by-design,
      not a regression this test should block on. Re-run this file after any
      future change to see if the count/magnitude of these has moved.

Run standalone: python3 tests/golden/compare.py
(Expects py_results.json and ts_results.json already generated -- see
run.sh / test_golden_hex_risk_parity.py for the full pipeline.)
"""
import json
import sys
from pathlib import Path

GOLDEN_DIR = Path(__file__).resolve().parent

TIER1_TOL = 1e-4
AC_TOL = 0.01
CHANNEL_TOL = 0.1  # as proposed to the user, for the known-divergent channels


def tier1_check(py, ts):
    failures = []
    for fn in py:
        py_vals, ts_vals = py[fn], ts[fn]
        if len(py_vals) != len(ts_vals):
            failures.append(f"  {fn}: length mismatch py={len(py_vals)} ts={len(ts_vals)}")
            continue
        for i, (pv, tv) in enumerate(zip(py_vals, ts_vals)):
            if abs(pv - tv) > TIER1_TOL:
                failures.append(f"  {fn}[{i}]: py={pv}  ts={tv}  diff={abs(pv-tv):.6f}")
    return failures


def tier2_check(py, ts):
    ac_failures = []
    channel_reports = []  # informational, per hex/channel
    by_h3_ts = {r["h3_id"]: r for r in ts}

    for pr in py:
        h3 = pr["h3_id"]
        tr = by_h3_ts.get(h3)
        if tr is None:
            ac_failures.append(f"  {pr['district']} ({h3}): missing from TS results")
            continue

        # (a) AC -- hard gate
        ac_diff = abs(pr["inputs"]["ac"] - tr["inputs"]["ac"])
        if ac_diff > AC_TOL:
            ac_failures.append(
                f"  {pr['district']}, {pr['state']} ({pr['category']}): "
                f"AC py={pr['inputs']['ac']} ts={tr['inputs']['ac']} diff={ac_diff:.4f}"
            )

        # (b) known-divergent inputs + downstream channels -- informational
        input_diffs = {
            "slope": (pr["inputs"]["slope"], "n/a (ts uses flat DEFAULT_SLOPE=3.0)"),
            "dist_w": (pr["inputs"]["dist_w"], "n/a (ts uses flat DEFAULT_DIST_WATER=5000)"),
            "sand_pct": (pr["inputs"]["sand_pct"], tr["inputs"]["sand_pct"]),
            "exposure_10": (pr["inputs"]["exposure_10"], tr["inputs"]["exposure_10"]),
        }
        for ch in ("flood", "heat", "wetbulb"):
            py_r, ts_r = pr["risk"][ch], tr["risk"][ch]
            diff = abs(py_r - ts_r)
            channel_reports.append({
                "district": pr["district"], "state": pr["state"], "category": pr["category"],
                "channel": ch, "py_risk": py_r, "ts_risk": ts_r, "diff": round(diff, 4),
                "within_tol": diff <= CHANNEL_TOL,
                "py_slope": pr["inputs"]["slope"], "py_dist_w": pr["inputs"]["dist_w"],
                "py_exposure": pr["inputs"]["exposure_10"], "ts_exposure": tr["inputs"]["exposure_10"],
            })

    return ac_failures, channel_reports


def main():
    py = json.loads((GOLDEN_DIR / "py_results.json").read_text())
    ts = json.loads((GOLDEN_DIR / "ts_results.json").read_text())

    print("=" * 78)
    print("GOLDEN PARITY TEST: scripts/risk/formulas.py  vs  simulatorFormulas.ts")
    print("=" * 78)

    print(f"\n--- TIER 1: formula parity (hex-independent, tol={TIER1_TOL}) ---")
    t1_failures = tier1_check(py["tier1"], ts["tier1"])
    n_vectors = sum(len(v) for v in py["tier1"].values())
    if t1_failures:
        print(f"FAIL — {len(t1_failures)}/{n_vectors} vectors mismatched:")
        for f in t1_failures:
            print(f)
    else:
        print(f"PASS — all {n_vectors} vectors match within {TIER1_TOL}")

    print(f"\n--- TIER 2a: adaptive_capacity parity, 25 real hexes (tol={AC_TOL}) ---")
    ac_failures, channel_reports = tier2_check(py["tier2"], ts["tier2"])
    if ac_failures:
        print(f"FAIL — {len(ac_failures)}/25 hexes mismatched:")
        for f in ac_failures:
            print(f)
    else:
        print(f"PASS — all 25 hexes' AC match within {AC_TOL}")

    print(f"\n--- TIER 2b: per-channel risk, 25 real hexes (informational, tol={CHANNEL_TOL}) ---")
    print("NOT a pass/fail gate -- reScoreHex() doesn't read real slope_deg/")
    print("dist_water_m/real_sand_pct and uses real (not flat-national) exposure")
    print("demographics; both are known, pre-existing gaps found while building")
    print("this test (see file docstring), not regressions. Shown for visibility")
    print("and to track whether the gap changes after a future fix.\n")
    within = [r for r in channel_reports if r["within_tol"]]
    outside = [r for r in channel_reports if not r["within_tol"]]
    print(f"{len(within)}/{len(channel_reports)} hex-channels within {CHANNEL_TOL}")
    if outside:
        print(f"\n{len(outside)} outside tolerance (sorted by diff, worst first):")
        for r in sorted(outside, key=lambda r: -r["diff"])[:15]:
            print(f"  {r['district']:<20} {r['state']:<18} [{r['category']:<16}] {r['channel']:<8} "
                  f"py={r['py_risk']:<7} ts={r['ts_risk']:<7} diff={r['diff']:<6} "
                  f"(py_slope={r['py_slope']}, py_dist_w={r['py_dist_w']}, "
                  f"exposure py={r['py_exposure']} ts={r['ts_exposure']})")
        if len(outside) > 15:
            print(f"  ... and {len(outside)-15} more")

    print("\n" + "=" * 78)
    hard_fail = bool(t1_failures) or bool(ac_failures)
    if hard_fail:
        print("RESULT: FAIL (Tier 1 and/or Tier 2a regression gate tripped)")
    else:
        print("RESULT: PASS (regression gates clean; Tier 2b divergence is known/expected -- see above)")
    print("=" * 78)

    sys.exit(1 if hard_fail else 0)


if __name__ == "__main__":
    main()
