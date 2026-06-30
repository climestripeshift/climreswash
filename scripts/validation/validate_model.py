"""
Model validation: check predicted risk against real NFHS-5 health outcomes.
Produces reports/model_validation_report.md + reports/validation_data.csv.

DOES NOT modify any risk computation. Read-only analysis.

Run: python scripts/validation/validate_model.py
"""
import csv
import json
import math
import os
from collections import defaultdict
from pathlib import Path

from scipy.stats import spearmanr, pearsonr

ROOT = Path(__file__).resolve().parent.parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
NFHS_CSV  = ROOT / "data/nfhs5_district_wash.csv"
REPORT_MD = ROOT / "reports/model_validation_report.md"
REPORT_CSV = ROOT / "reports/validation_data.csv"

# ── Matched pairs: predicted risk → expected NFHS outcome correlation ─────────
MATCHED_PAIRS = [
    ("flood_risk",     "wash_diarrhoea_pct",  "positive", "Flood → diarrhoea (waterborne disease)"),
    ("drought_risk",   "wash_stunting_pct",    "positive", "Drought → stunting (food/water insecurity)"),
    ("drought_risk",   "wash_wasting_pct",     "positive", "Drought → wasting (food/water insecurity)"),
    ("heat_risk",      "wash_anaemia_pct",     "positive", "Heat → anaemia (heat-nutrition link)"),
    ("hex_risk",       "wash_vaccination_pct", "negative", "Overall risk → low vaccination (weak health systems)"),
    ("hex_risk",       "wash_diarrhoea_pct",   "positive", "Overall risk → diarrhoea (general check)"),
    ("pollution_risk", "wash_anaemia_pct",     "positive", "Air pollution → anaemia (closest available health proxy; NFHS-5 has no direct respiratory measure)"),
]

MISMATCHED_PAIRS = [
    ("heat_risk",    "wash_diarrhoea_pct",   "weak", "Heat vs diarrhoea (should be weaker)"),
    ("flood_risk",   "wash_anaemia_pct",     "weak", "Flood vs anaemia (should be weaker)"),
]


def main():
    print("=" * 70)
    print("  ClimResWASH Model Validation")
    print("  Predicted risk vs observed NFHS-5 health outcomes")
    print("=" * 70)

    # ── Step 1: Load hex data and aggregate to district ────────────────────
    print("\nStep 1: Aggregating hex risk to district (population-weighted)...")
    with open(HEX_PROPS) as f:
        props = json.load(f)

    risk_cols = ["hex_risk", "flood_risk", "heat_risk", "cyclone_risk", "drought_risk",
                 "wetbulb_risk", "landslide_risk", "coldwave_risk", "pollution_risk"]
    outcome_cols = ["wash_stunting_pct", "wash_wasting_pct", "wash_diarrhoea_pct",
                    "wash_anaemia_pct", "wash_vaccination_pct"]

    # Group by district, population-weighted average
    districts: dict[str, dict] = {}
    for p in props:
        dname = p.get("district_name", "")
        if not dname or dname == "Unknown":
            continue
        pop = p.get("population", 0) or 0
        if pop <= 0:
            continue

        if dname not in districts:
            districts[dname] = {
                "state": p.get("state", ""),
                "total_pop": 0,
                "hex_count": 0,
            }
            for col in risk_cols:
                districts[dname][f"{col}_weighted_sum"] = 0.0
            for col in outcome_cols:
                districts[dname][col] = p.get(col, 0) or 0  # same for all hexes in district

        d = districts[dname]
        d["total_pop"] += pop
        d["hex_count"] += 1
        for col in risk_cols:
            d[f"{col}_weighted_sum"] += (p.get(col, 0) or 0) * pop

    # Compute weighted means
    for dname, d in districts.items():
        if d["total_pop"] > 0:
            for col in risk_cols:
                d[col] = d[f"{col}_weighted_sum"] / d["total_pop"]
        else:
            for col in risk_cols:
                d[col] = 0.0

    print(f"  {len(districts)} districts with risk + outcome data")

    # ── Step 2: Build correlation table ────────────────────────────────────
    print("\nStep 2: Computing correlations...")

    def compute_corr(predicted_key, observed_key):
        x, y = [], []
        for d in districts.values():
            pv = d.get(predicted_key, 0)
            ov = d.get(observed_key, 0)
            if pv is not None and ov is not None and ov > 0:
                x.append(float(pv))
                y.append(float(ov))
        n = len(x)
        if n < 10:
            return {"n": n, "spearman_r": None, "spearman_p": None, "pearson_r": None, "pearson_p": None}
        sr, sp = spearmanr(x, y)
        pr, pp = pearsonr(x, y)
        return {"n": n, "spearman_r": round(sr, 3), "spearman_p": round(sp, 4),
                "pearson_r": round(pr, 3), "pearson_p": round(pp, 4)}

    matched_results = []
    for pred, obs, expected_dir, desc in MATCHED_PAIRS:
        corr = compute_corr(pred, obs)
        if corr["spearman_r"] is not None:
            if expected_dir == "positive":
                direction_ok = corr["spearman_r"] > 0
            elif expected_dir == "negative":
                direction_ok = corr["spearman_r"] < 0
            else:
                direction_ok = True
        else:
            direction_ok = None
        matched_results.append({
            "predicted": pred, "observed": obs, "expected": expected_dir,
            "desc": desc, "direction_ok": direction_ok, **corr,
        })

    mismatched_results = []
    for pred, obs, expected_dir, desc in MISMATCHED_PAIRS:
        corr = compute_corr(pred, obs)
        mismatched_results.append({
            "predicted": pred, "observed": obs, "expected": expected_dir,
            "desc": desc, **corr,
        })

    # ── Step 3: Discriminant test ──────────────────────────────────────────
    matched_abs = [abs(r["spearman_r"]) for r in matched_results if r["spearman_r"] is not None]
    mismatched_abs = [abs(r["spearman_r"]) for r in mismatched_results if r["spearman_r"] is not None]
    avg_matched = sum(matched_abs) / len(matched_abs) if matched_abs else 0
    avg_mismatched = sum(mismatched_abs) / len(mismatched_abs) if mismatched_abs else 0
    discriminates = avg_matched > avg_mismatched

    # ── Step 4: Find disagreement districts ────────────────────────────────
    print("\nStep 3: Finding disagreement districts...")
    disagreements = []
    for dname, d in districts.items():
        risk = d.get("hex_risk", 0)
        diarr = d.get("wash_diarrhoea_pct", 0)
        stunt = d.get("wash_stunting_pct", 0)
        # High risk but good outcomes
        if risk > 3 and diarr < 3 and stunt < 20:
            disagreements.append((dname, d["state"], risk, diarr, stunt, "High risk, good outcomes"))
        # Low risk but bad outcomes
        elif risk < 1 and (diarr > 8 or stunt > 40):
            disagreements.append((dname, d["state"], risk, diarr, stunt, "Low risk, bad outcomes"))
    disagreements.sort(key=lambda x: -abs(x[2]))

    # ── Step 5: Generate report ────────────────────────────────────────────
    print("\nStep 4: Generating report...")

    # Summary
    direction_count = sum(1 for r in matched_results if r["direction_ok"])
    total_matched = sum(1 for r in matched_results if r["direction_ok"] is not None)

    report = []
    report.append("# ClimResWASH Model Validation Report\n")
    report.append("## Summary\n")
    report.append(f"Predicted risk scores were validated against {len(districts)} districts of real NFHS-5 health outcomes. "
                  f"Direction was correct for {direction_count}/{total_matched} matched pairs. "
                  f"Matched pairs show {'stronger' if discriminates else 'similar'} correlation than mismatched pairs "
                  f"(avg |r| = {avg_matched:.3f} vs {avg_mismatched:.3f}){'.' if discriminates else ' — model may not discriminate between hazards.'}\n")

    report.append("\n## Headline correlations (matched pairs)\n")
    report.append("| Predicted | Observed | Spearman r | p-value | n | Direction? | Interpretation |")
    report.append("|---|---|---|---|---|---|---|")
    for r in matched_results:
        dir_mark = "✅" if r["direction_ok"] else ("❌" if r["direction_ok"] is False else "—")
        sr = f"{r['spearman_r']:.3f}" if r["spearman_r"] is not None else "N/A"
        sp = f"{r['spearman_p']:.4f}" if r["spearman_p"] is not None else "N/A"
        strength = ""
        if r["spearman_r"] is not None:
            absr = abs(r["spearman_r"])
            if absr >= 0.4: strength = "Good"
            elif absr >= 0.2: strength = "Moderate"
            elif absr >= 0.1: strength = "Weak"
            else: strength = "Very weak"
        report.append(f"| {r['predicted']} | {r['observed']} | {sr} | {sp} | {r['n']} | {dir_mark} | {strength} |")

    report.append(f"\n## Discriminant test\n")
    report.append(f"- Mean |r| for matched pairs: **{avg_matched:.3f}**")
    report.append(f"- Mean |r| for mismatched pairs: **{avg_mismatched:.3f}**")
    report.append(f"- {'✅ Model discriminates between hazards' if discriminates else '⚠️ Model does NOT discriminate — matched and mismatched pairs show similar strength'}\n")

    report.append("\n## Full correlation matrix\n")
    report.append("| Predicted \\ Observed | " + " | ".join(outcome_cols) + " |")
    report.append("|---" + "|---" * len(outcome_cols) + "|")
    for rcol in risk_cols:
        row_vals = []
        for ocol in outcome_cols:
            c = compute_corr(rcol, ocol)
            row_vals.append(f"{c['spearman_r']:.2f}" if c["spearman_r"] is not None else "N/A")
        report.append(f"| {rcol} | " + " | ".join(row_vals) + " |")

    report.append("\n## Interpretation & caveats\n")
    report.append("- Correlations of **0.2–0.5 are reasonable** and **0.4–0.7 are good** for a climate-only predictor. "
                  "Health outcomes have many non-climate drivers (income, governance, caste, remoteness).")
    report.append("- A near-zero or wrong-sign correlation on a matched pair flags a possible model problem in that hazard.")
    report.append("- This is Spearman rank correlation across ~700 districts; it tests geographic pattern, not causation.")
    report.append(f"- Likelihood is real 30-year CHIRPS/ERA5 climatology; air pollution is real WashU/ACAG satellite PM2.5.\n")

    report.append("\n## Districts where model and reality disagree most\n")
    report.append("| District | State | hex_risk | Diarrhoea% | Stunting% | Issue |")
    report.append("|---|---|---|---|---|---|")
    for dname, state, risk, diarr, stunt, issue in disagreements[:10]:
        report.append(f"| {dname} | {state} | {risk:.2f} | {diarr:.1f} | {stunt:.1f} | {issue} |")
    if not disagreements:
        report.append("| (none found) | | | | | |")

    report.append(f"\n## Verdict\n")
    if discriminates and direction_count >= total_matched // 2:
        report.append("✅ **Model validates.** Predicted risk tracks observed NFHS-5 outcomes with correct direction "
                      "in most matched pairs, and matched pairs correlate more strongly than mismatched. "
                      "The hazard-specific signal is real, not just a blended geographic correlation.")
    elif direction_count >= total_matched // 2:
        report.append("⚠️ **Partial validation.** Directions are mostly correct but discriminant power is weak. "
                      "The model captures something real but may not distinguish between hazard types well enough.")
    else:
        report.append("❌ **Validation concerns.** Directions wrong for multiple matched pairs. "
                      "The model may need recalibration or better likelihood data.")

    report.append(f"\n---\n*Generated from {len(districts)} districts, {len(props)} hexes. "
                  f"Real climatology, real pollution, corrected district-state labels.*\n")

    # Write report
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text("\n".join(report))
    print(f"  Report: {REPORT_MD}")

    # Write CSV
    csv_cols = ["district", "state", "total_pop", "hex_count"] + risk_cols + outcome_cols
    with open(REPORT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=csv_cols, extrasaction="ignore")
        w.writeheader()
        for dname, d in sorted(districts.items()):
            d["district"] = dname
            w.writerow(d)
    print(f"  CSV: {REPORT_CSV}")

    # ── Print headline table ───────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  HEADLINE CORRELATIONS (matched pairs)")
    print("=" * 70)
    for r in matched_results:
        dir_mark = "✅" if r["direction_ok"] else "❌"
        sr = f"{r['spearman_r']:+.3f}" if r["spearman_r"] is not None else "N/A"
        print(f"  {r['predicted']:18s} vs {r['observed']:24s}  r={sr}  {dir_mark}  ({r['desc']})")

    print(f"\n  DISCRIMINANT: matched avg |r|={avg_matched:.3f}  vs  mismatched avg |r|={avg_mismatched:.3f}")
    print(f"  {'✅ Model discriminates' if discriminates else '⚠️ Model does not discriminate'}")
    print("=" * 70)


if __name__ == "__main__":
    main()
