"""
Fix gw_stress_score saturation: min(1, depth/30) hard-caps every district with a
water table deeper than 30m at exactly 1.00, erasing real differentiation in the
severe tail (20 districts nationally, from 30m to 90m, all tied).

New formula:
  depth <= 30m : depth/30                       (unchanged — 476/496 districts)
  depth  > 30m : 1 + TAIL_WEIGHT * ln(depth/30)  (smooth, unbounded, monotonic)

Continuous at depth=30 (both give 1.0). TAIL_WEIGHT=0.4 puts the deepest district
nationally (Gandhinagar, Gujarat, 89.9m) at 1.44 — a meaningful spread above 1.0
without the score exploding.

Run: python scripts/fix_gw_stress_saturation.py
"""
import csv
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GW_CSV = ROOT / "data/groundwater_district.csv"

TAIL_WEIGHT = 0.4


def score_for_depth(depth_mbgl: float) -> float:
    if depth_mbgl <= 30:
        return depth_mbgl / 30
    return 1 + TAIL_WEIGHT * math.log(depth_mbgl / 30)


def main():
    rows = list(csv.DictReader(GW_CSV.open()))
    fieldnames = list(rows[0].keys())

    changed = []
    for r in rows:
        depth = float(r["mean_water_level_mbgl"])
        old = float(r["gw_stress_score"])
        new = round(score_for_depth(depth), 3)
        if abs(new - old) > 1e-6:
            changed.append((r["state"], r["district"], depth, old, new))
        r["gw_stress_score"] = f"{new:.3f}"

    with GW_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    changed.sort(key=lambda x: -x[2])
    print(f"{len(rows)} districts total, {len(changed)} rescored (depth > 30m)\n")
    print(f"  {'State':20s} {'District':20s} {'Depth':>7s} {'Old':>6s} {'New':>6s}")
    for state, district, depth, old, new in changed:
        print(f"  {state:20s} {district:20s} {depth:7.1f} {old:6.3f} {new:6.3f}")
    print(f"\nWrote {GW_CSV}")


if __name__ == "__main__":
    main()
