#!/usr/bin/env python3
"""
compute_nfhs_trends.py — NFHS-5 (2019-21) → NFHS-6 (2023-24) state trends
+ correlations between platform climate exposure and NFHS-6 outcomes/changes.

Inputs:
  data/nfhs6_state_key_indicators.json   (hand-extracted from NFHS-6 fact sheets)
  client/public/data/india_hex_props.json (state climate aggregates)

Output:
  client/public/data/nfhs_trends.json
    { meta, national, states[], correlations[], highlights }

NFHS-6 fact sheets do NOT publish sanitation, anaemia, clean fuel or
handwashing — those stay NFHS-5 elsewhere in the platform.
"""

import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Hex-data state name → NFHS-6 factsheet state name
HEX_TO_NFHS = {
    "Andaman & Nicobar Island": "Andaman & Nicobar Islands",
    "Dadra & Nagar Haveli": "Dadra & Nagar Haveli and Daman & Diu",
    "Daman & Diu": "Dadra & Nagar Haveli and Daman & Diu",
}

# Fact sheets caution that these have small samples (wide confidence intervals)
SMALL_SAMPLE = {
    "Goa", "Sikkim", "Chandigarh", "Lakshadweep",
    "Andaman & Nicobar Islands", "Dadra & Nagar Haveli and Daman & Diu",
    "Puducherry", "Ladakh",
}

INDICATORS = ["water", "stunting", "wasting", "severe_wasting",
              "underweight", "diarrhoea", "mhm"]
# For these, an increase is an improvement; for the rest a decrease is
HIGHER_IS_BETTER = {"water", "mhm"}


def load(path):
    with open(path) as f:
        return json.load(f)


def p90(vals):
    if not vals:
        return 0.0
    s = sorted(vals)
    return s[min(len(s) - 1, int(len(s) * 0.9))]


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sxy / math.sqrt(sxx * syy)


nfhs = load(ROOT / "data/nfhs6_state_key_indicators.json")
hexes = load(ROOT / "client/public/data/india_hex_props.json")

# ── State climate aggregates from hex grid ──────────────────────────────────
clim = defaultdict(lambda: {"pop": 0, "heat": 0, "wetbulb": 0, "gw": 0,
                            "pm25": 0, "flood": 0, "sanitation": 0,
                            "drought_vals": []})
for h in hexes:
    state = h.get("state")
    if not state:
        continue
    state = HEX_TO_NFHS.get(state, state)
    pop = max(h.get("population") or 0, 1)
    c = clim[state]
    c["pop"] += pop
    c["heat"] += (h.get("heat_risk") or 0) * pop
    c["wetbulb"] += (h.get("wetbulb_risk") or 0) * pop
    c["gw"] += (h.get("gw_stress_score") or 0) * pop
    c["pm25"] += (h.get("pm25_annual") or 0) * pop
    c["flood"] += (h.get("flood_risk") or 0) * pop
    c["sanitation"] += (h.get("wash_sanitation_pct") or 0) * pop
    c["drought_vals"].append(h.get("drought_risk") or 0)

climate = {}
for state, c in clim.items():
    pop = c["pop"]
    climate[state] = {
        "heat": c["heat"] / pop,
        "wetbulb": c["wetbulb"] / pop,
        "gw": c["gw"] / pop * 10,          # 0-1 → 0-10
        "pm25": c["pm25"] / pop,
        "flood": c["flood"] / pop,
        "sanitation_nfhs5": c["sanitation"] / pop,
        "drought_p90": p90(c["drought_vals"]),
    }

# ── Per-state trend rows ────────────────────────────────────────────────────
states = []
for name, vals in nfhs["states"].items():
    row = {"state": name, "small_sample": name in SMALL_SAMPLE}
    for ind in INDICATORS:
        v6, v5 = vals[ind]
        delta = round(v6 - v5, 1)
        improved = delta > 0 if ind in HIGHER_IS_BETTER else delta < 0
        row[ind] = {"nfhs6": v6, "nfhs5": v5, "delta": delta,
                    "improved": improved}
    cl = climate.get(name)
    if cl:
        row["climate"] = {k: round(v, 2) for k, v in cl.items()}
    states.append(row)
states.sort(key=lambda r: r["state"])

national = {}
for ind in INDICATORS:
    v6, v5 = nfhs["india"][ind]
    delta = round(v6 - v5, 1)
    national[ind] = {"nfhs6": v6, "nfhs5": v5, "delta": delta,
                     "improved": delta > 0 if ind in HIGHER_IS_BETTER else delta < 0}

# ── Correlations: climate exposure × NFHS-6 outcomes / changes ──────────────
# Small-sample states excluded to keep r honest. Insight text was written
# AFTER checking the observed direction — do not re-order pairs without
# re-verifying signs.
CORR_SPECS = [
    ("mhm", "nfhs6", "Hygienic menstrual protection, women 15-24 (NFHS-6 %)",
     "stunting", "nfhs6", "Child stunting (NFHS-6 %)",
     "Menstrual hygiene access vs child stunting",
     "The strongest WASH-health link in the new data: states where young women have hygienic menstrual protection have far less child stunting. MHM access proxies the whole women's WASH + education + empowerment bundle that drives child nutrition."),
    ("wetbulb", "climate", "Wet-bulb heat risk (0-10)",
     "underweight", "nfhs6", "Child underweight (NFHS-6 %)",
     "Humid-heat exposure vs child underweight",
     "Humid-heat states carry markedly higher child underweight in 2023-24 — sustained wet-bulb stress suppresses appetite, raises infection burden, and cuts caregiver work capacity."),
    ("wetbulb", "climate", "Wet-bulb heat risk (0-10)",
     "wasting", "nfhs6", "Child wasting (NFHS-6 %)",
     "Humid-heat exposure vs child wasting",
     "Acute malnutrition tracks the same humid-heat gradient — the wet-bulb belt (IGP + east coast) is also India's wasting belt."),
    ("pm25", "climate", "PM2.5 annual (µg/m³)",
     "underweight", "nfhs6", "Child underweight (NFHS-6 %)",
     "Air pollution vs child underweight",
     "High-PM2.5 states show more child underweight — pollution operates through low birth weight and repeated respiratory infection."),
    ("heat", "climate", "Heat risk (0-10)",
     "wasting", "delta", "Change in wasting, NFHS-5→6 (pp)",
     "Heat exposure vs change in child wasting",
     "The climate signature in the trend: hotter states saw wasting WORSEN between 2019-21 and 2023-24 (Haryana +5.1, Punjab +7.4, MP +4.9), while cooler states improved. The 2023-24 fieldwork spans the 2023 El Niño."),
    ("gw", "climate", "Groundwater stress (0-10)",
     "wasting", "delta", "Change in wasting, NFHS-5→6 (pp)",
     "Groundwater stress vs change in child wasting",
     "Groundwater-stressed states also saw wasting rise — consistent with the drought→water→nutrition cascade the El Niño brief models."),
    ("sanitation_nfhs5", "climate", "Sanitation coverage (NFHS-5 %)",
     "stunting", "nfhs6", "Child stunting (NFHS-6 %)",
     "Prior sanitation coverage vs later stunting",
     "Sanitation coverage in 2019-21 predicts stunting in 2023-24 — WASH infrastructure protects child growth years later."),
    ("heat", "climate", "Heat risk (0-10)",
     "diarrhoea", "delta", "Change in diarrhoea, NFHS-5→6 (pp)",
     "Heat exposure vs change in child diarrhoea",
     "Hotter states saw child diarrhoea rise more (UP 5.6→13.0, Haryana 4.9→10.7) — heat degrades water quality and food safety."),
    ("water", "delta", "Change in improved water, NFHS-5→6 (pp)",
     "diarrhoea", "delta", "Change in diarrhoea, NFHS-5→6 (pp)",
     "Change in water access vs change in diarrhoea",
     "Where improved-water access grew, diarrhoea fell — the most direct WASH-health trend pairing available at state level."),
    ("sanitation_nfhs5", "climate", "Sanitation coverage (NFHS-5 %)",
     "diarrhoea", "nfhs6", "Child diarrhoea (NFHS-6 %)",
     "Prior sanitation coverage vs later diarrhoea",
     "Better-sanitized states in 2019-21 report less child diarrhoea in 2023-24."),
]

correlations = []
for x_key, x_src, x_name, y_ind, y_field, y_name, label, insight in CORR_SPECS:
    pts = []
    for row in states:
        if row["small_sample"]:
            continue
        if x_src == "climate":
            if "climate" not in row:
                continue
            x = row["climate"].get(x_key)
        else:  # x from an NFHS indicator ("nfhs6" or "delta")
            x = row[x_key][x_src]
        y = row[y_ind][y_field]
        if x is None or y is None:
            continue
        pts.append({"state": row["state"], "x": round(x, 2), "y": round(y, 2)})
    r = pearson([p["x"] for p in pts], [p["y"] for p in pts])
    if r is None:
        continue
    correlations.append({
        "label": label,
        "insight": insight,
        "x_label": x_name,
        "y_label": y_name,
        "r": round(r, 2),
        "n": len(pts),
        "points": pts,
    })
correlations.sort(key=lambda c: -abs(c["r"]))

# ── Highlights: biggest movers per indicator (excl. small samples) ──────────
big = [r for r in states if not r["small_sample"]]
highlights = {}
for ind in INDICATORS:
    ranked = sorted(big, key=lambda r: r[ind]["delta"])
    lo = [{"state": r["state"], "delta": r[ind]["delta"],
           "nfhs6": r[ind]["nfhs6"]} for r in ranked[:5]]
    hi = [{"state": r["state"], "delta": r[ind]["delta"],
           "nfhs6": r[ind]["nfhs6"]} for r in ranked[-5:][::-1]]
    if ind in HIGHER_IS_BETTER:
        highlights[ind] = {"improvers": hi, "regressors": lo}
    else:
        highlights[ind] = {"improvers": lo, "regressors": hi}

out = {
    "meta": {
        "source": nfhs["_meta"]["source"],
        "note": nfhs["_meta"]["note"],
        "indicators": nfhs["_meta"]["indicators"],
        "small_sample_states": sorted(SMALL_SAMPLE),
    },
    "national": national,
    "states": states,
    "correlations": correlations,
    "highlights": highlights,
}

out_path = ROOT / "client/public/data/nfhs_trends.json"
with open(out_path, "w") as f:
    json.dump(out, f, separators=(",", ":"))

print(f"✓ nfhs_trends.json written ({out_path.stat().st_size:,} bytes)")
print(f"  States: {len(states)}  (small-sample flagged: {sum(r['small_sample'] for r in states)})")
print()
print("National NFHS-5 → NFHS-6:")
for ind in INDICATORS:
    n = national[ind]
    arrow = "↑" if n["delta"] > 0 else "↓" if n["delta"] < 0 else "→"
    tag = "better" if n["improved"] else "worse" if n["delta"] != 0 else "flat"
    print(f"  {ind:15s} {n['nfhs5']:5.1f} → {n['nfhs6']:5.1f}  {arrow}{abs(n['delta']):.1f}pp ({tag})")
print()
print("Correlations (|r|, n):")
for c in correlations:
    print(f"  r={c['r']:+.2f} n={c['n']:2d}  {c['label']}")
