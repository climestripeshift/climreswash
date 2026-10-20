"""
Stress-output report for the 4-D hazard layers: what each hazard produces under every stress level
(baseline and four IPCC scenarios at three horizons), counted the DRR way: PEOPLE and CHILDREN
exposed inside a hazard class, not only a score. Reads the index.json files written by the
compute_*_4d.py scripts (no recomputation) and writes reports/hazard_4d_stress_outputs_<date>.md.

Exposure counting follows the practice in DRR_RISK_FORMULA_REFERENCES.md: INFORM and UNICEF CCRI
report people / children exposed (absolute) and their share (relative); ThinkHazard reports a
High / Medium class. Here "high or extreme" = score >= 5 and "moderate or above" = score >= 2.5.

Run: python scripts/hazard_4d_stress_report.py [YYYY-MM-DD]
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "client/public/data"
HAZARDS = [
    ("heat", "Heat wave", "heat_4d"), ("flood", "Flood", "flood_4d"), ("drought", "Drought", "drought_4d"),
    ("wetbulb", "Wet-bulb (humid heat)", "wetbulb_4d"), ("landslide", "Landslide", "landslide_4d"),
    ("flashflood", "Flash flood", "flashflood_4d"), ("coldwave", "Cold wave", "coldwave_4d"),
]
SSPS = ["ssp126", "ssp245", "ssp370", "ssp585"]
HZ = ["2030", "2050", "2080"]
LABEL = {"ssp126": "SSP1-2.6", "ssp245": "SSP2-4.5", "ssp370": "SSP3-7.0", "ssp585": "SSP5-8.5"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def key(ssp, hz):
    return "baseline_1991-2020" if ssp == "baseline" else f"{ssp}_{hz}"


def m(x, d=0):
    return f"{x / 1e6:,.{d}f}"


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
    out = [f"# Hazard 4-D stress outputs ({stamp})", "",
           "What each hazard produces under each stress level, counted as **people and children exposed**, "
           "the way the DRR frameworks in `DRR_RISK_FORMULA_REFERENCES.md` report exposure (INFORM and UNICEF CCRI: "
           "absolute number and share; ThinkHazard: High and Medium classes). Generated from the saved 4-D summaries by "
           "`scripts/hazard_4d_stress_report.py`; no recomputation.", "",
           "**How to read it.**",
           "- *Stress level* = baseline (1991–2020) or an IPCC AR6 scenario at a horizon (2030 = 2021–2040, 2050 = 2041–2060, 2080 = 2081–2100). Warming per level is in `HAZARD_4D_CALCULATIONS.md` §3.3.",
           "- *High or extreme* = hazard score ≥ 5; *moderate or above* = score ≥ 2.5. The bands are generic, not tuned per hazard (A16), so people counts are **not comparable across hazards**: use them to compare stress levels *within* one hazard.",
           "- *Worst month* = each hex's own worst calendar month; a person is counted once even if exposed in several months.",
           "- People and children are from the hex grid (WorldPop 2020, children under 5 from Census age ratios): "
           "the grid holds about 1,224 million people, about 10 % fewer than the 1,354 million in `BASE_LAYERS.md` (D8). Hexes with no estimate are excluded and the covered share is shown.",
           "- Scores are **hazard only** (no vulnerability or capacity) and are not validated against observed events (`HAZARD_4D_CALCULATIONS.md` §8).", ""]
    for hid, title, folder in HAZARDS:
        idx = json.loads((DATA / folder / "index.json").read_text())
        agg = idx["aggregates"]
        cov = idx.get("coverage", {})
        out += [f"## {title}", ""]
        if cov and cov.get("pct_hexes", 100) < 99.95:
            out += [f"Coverage: {cov['pct_hexes']:.1f} % of hexes, {cov['pct_pop']:.1f} % of people have an estimate "
                    f"({m(cov['pop_covered'])} of {m(cov['pop_total'])} million people).", ""]
        if idx.get("coverage_note"):
            out += [f"Note: {idx['coverage_note']}", ""]
        out += ["### People and children exposed, worst month per hex", "",
                "| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |",
                "|---|---:|---:|---:|---:|---:|"]
        rows = [("Baseline 1991–2020", "baseline", "1991-2020")] + [(f"{LABEL[s]} {h}", s, h) for s in SSPS for h in HZ]
        for lab, s, h in rows:
            a = agg[key(s, h)]["india"]
            hm = a["hottest_month"]
            out.append(f"| {lab} | {hm['pop_weighted_mean']:.2f} | {m(hm['people_high'], 1)} | {hm['pct_pop_high_or_extreme']:.1f} | "
                       f"{m(hm['children_u5_high'], 1)} | {m(hm['people_medium_or_above'], 1)} |")
        # peak month
        b = agg[key("baseline", "1991-2020")]["india"]
        w = agg[key("ssp585", "2080")]["india"]
        pb = max(range(12), key=lambda i: b["people_high"][i])
        pw = max(range(12), key=lambda i: w["people_high"][i])
        out += ["", f"Peak calendar month for people in high/extreme: baseline **{MONTHS[pb]}** "
                    f"({m(b['people_high'][pb], 1)} M), SSP5-8.5 2080 **{MONTHS[pw]}** ({m(w['people_high'][pw], 1)} M).", ""]
        # states
        base_st = agg[key("baseline", "1991-2020")]["states"]
        end_st = agg[key("ssp585", "2050")]["states"]
        rows_st = []
        for st, a in end_st.items():
            if a.get("no_estimate") or st not in base_st or base_st[st].get("no_estimate"):
                continue
            nb, ne = base_st[st]["hottest_month"]["people_high"], a["hottest_month"]["people_high"]
            rows_st.append((ne - nb, st, nb, ne, a["hottest_month"]["children_u5_high"]))
        rows_st.sort(reverse=True)
        out += ["### States with the largest increase in people exposed, baseline to SSP5-8.5 2050", "",
                "| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |", "|---|---:|---:|---:|---:|"]
        for inc, st, nb, ne, ke in rows_st[:8]:
            out.append(f"| {st} | {m(nb, 1)} | {m(ne, 1)} | {m(inc, 1)} | {m(ke, 2)} |")
        out.append("")
    out += ["## Caveats shared by every table", "",
            "1. Scenario warming is the approximate, spatially uniform AR6-derived table (A1, A2); results move with it.",
            "2. Hazard bands are generic (A16); the counts answer \"how many people are in the worst fifth of this hazard's scale\", not \"how many are harmed\".",
            "3. No return-period classes beyond the 10-year storm (flood, landslide, flash flood) and the 1-in-10 dry window (drought): the DRR practice of 10/50/1000-year classes (ThinkHazard) and the 50-year basis used by UNICEF CCRI are not yet implemented.",
            "4. No vulnerability or coping-capacity dimension: these are hazard-and-exposure outputs only (INFORM's \"Hazard & Exposure\" dimension, not the risk index).",
            "5. Counts use a fixed 2020 population; future population growth is not applied, so exposure under future stress is understated for growing areas."]
    path = ROOT / "reports" / f"hazard_4d_stress_outputs_{stamp}.md"
    path.write_text("\n".join(out) + "\n")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
