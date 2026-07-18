#!/usr/bin/env python3
"""
compute_elnino.py — District-level El Niño compound risk.

El Niño → weakens SW monsoon → drought + heat spike in central/western India
→ groundwater depletion → JJM taps run dry → WASH cascade → child wasting spike.

Score formula (0-10):
  drought_p90    × 0.45  (90th percentile: captures worst-hit hexes in district)
  heat_max       × 0.20  (peak heat amplification during El Niño)
  gw_stress      × 0.15  (sustained drought depletes aquifers; 0-10 scaled)
  wash_gap/10    × 0.20  (districts with low sanitation hit hardest)

where wash_gap = 100 - sanitation_pct (from district rankings)

Output: client/public/data/elnino.json
"""

import json
from collections import defaultdict

def load(path):
    with open(path) as f:
        return json.load(f)

def save(path, data):
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))

def p90(vals):
    if not vals:
        return 0.0
    s = sorted(vals)
    return s[int(len(s) * 0.9)]

hexes    = load("client/public/data/india_hex_props.json")
rankings = load("client/public/data/district_rankings.json")
rank_map = {r["district"]: r for r in rankings}

# ── Aggregate hex → district ────────────────────────────────────────────────
dist = defaultdict(lambda: {
    "state": None, "pop": 0, "hex_count": 0,
    "drought_vals": [], "heat_vals": [], "gw_vals": [],
    "stunting": 0, "wasting": 0, "anaemia": 0, "burden_ch": 0,
})

for h in hexes:
    name = h.get("district_name")
    if not name:
        continue
    pop  = max(h.get("population") or 0, 1)
    agg  = dist[name]
    agg["state"]     = h.get("state")
    agg["pop"]      += pop
    agg["hex_count"] += 1
    agg["drought_vals"].append(h.get("drought_risk")      or 0)
    agg["heat_vals"].append(   h.get("heat_risk")         or 0)
    agg["gw_vals"].append(     h.get("gw_stress_score")   or 0)
    agg["stunting"]  += (h.get("wash_stunting_pct")       or 0) * pop
    agg["wasting"]   += (h.get("wash_wasting_pct")        or 0) * pop
    agg["anaemia"]   += (h.get("wash_anaemia_pct")        or 0) * pop
    agg["burden_ch"] += (h.get("weighted_burden_children") or 0) * pop

# ── Build district list ─────────────────────────────────────────────────────
districts = []
for name, agg in dist.items():
    pop = agg["pop"]
    if pop == 0:
        continue

    rk = rank_map.get(name, {})

    drought_p90 = p90(agg["drought_vals"])
    heat_max    = max(agg["heat_vals"]) if agg["heat_vals"] else 0
    gw_avg      = (sum(agg["gw_vals"]) / len(agg["gw_vals"])) * 10  # 0-1 → 0-10

    # WASH gap from district rankings sanitation (more reliable than hex JJM)
    sanitation  = rk.get("wash_sanitation_pct") or 50.0
    wash_gap    = max(0, 100 - sanitation)  # 0-100

    score = min(10, max(0,
        drought_p90 * 0.45 +
        heat_max    * 0.20 +
        gw_avg      * 0.15 +
        wash_gap / 10 * 0.20
    ))

    level = (
        "critical" if score >= 4.0 else
        "high"     if score >= 2.5 else
        "moderate" if score >= 1.2 else
        "low"
    )

    stunting  = agg["stunting"]  / pop
    wasting   = agg["wasting"]   / pop
    anaemia   = agg["anaemia"]   / pop
    burden_ch = agg["burden_ch"] / pop

    pop_total = rk.get("population_at_risk") or int(pop)
    children  = rk.get("children_under5_at_risk") or 0
    elderly   = rk.get("elderly_at_risk") or 0

    # JJM from rankings' WASH data (more reliable)
    jjm_pct = 100 - wash_gap  # infer from sanitation as proxy

    districts.append({
        "district":    name,
        "state":       agg["state"],
        "score":       round(score,       2),
        "level":       level,
        "drought":     round(drought_p90, 2),
        "heat":        round(heat_max,    2),
        "gw_stress":   round(gw_avg,      2),
        "sanitation":  round(sanitation,  1),
        "stunting_pct":round(stunting,    1),
        "wasting_pct": round(wasting,     1),
        "anaemia_pct": round(anaemia,     1),
        "burden_ch":   round(burden_ch,   1),
        "population":  int(pop_total),
        "children_u5": int(children),
        "elderly":     int(elderly),
    })

districts.sort(key=lambda x: -x["score"])

# ── State summaries ─────────────────────────────────────────────────────────
st = defaultdict(lambda: {
    "n": 0, "critical": 0, "high_or_critical": 0,
    "pop": 0, "children": 0,
    "score_sum": 0, "drought_sum": 0,
    "stunting_sum": 0, "wasting_sum": 0, "sanitation_sum": 0,
})
for d in districts:
    s = st[d["state"]]
    s["n"] += 1
    if d["level"] == "critical":           s["critical"] += 1
    if d["level"] in ("critical", "high"): s["high_or_critical"] += 1
    s["pop"]          += d["population"]
    s["children"]     += d["children_u5"]
    s["score_sum"]    += d["score"]
    s["drought_sum"]  += d["drought"]
    s["stunting_sum"] += d["stunting_pct"]
    s["wasting_sum"]  += d["wasting_pct"]
    s["sanitation_sum"]+= d["sanitation"]

state_summaries = []
for state, s in st.items():
    n = s["n"]
    state_summaries.append({
        "state":            state,
        "n_districts":      n,
        "critical":         s["critical"],
        "high_or_critical": s["high_or_critical"],
        "population":       s["pop"],
        "children_u5":      s["children"],
        "avg_score":        round(s["score_sum"]    / n, 2),
        "avg_drought":      round(s["drought_sum"]  / n, 2),
        "avg_stunting":     round(s["stunting_sum"] / n, 1),
        "avg_wasting":      round(s["wasting_sum"]  / n, 1),
        "avg_sanitation":   round(s["sanitation_sum"]/ n, 1),
    })
state_summaries.sort(key=lambda x: -x["avg_score"])

# ── Summary stats ───────────────────────────────────────────────────────────
critical  = [d for d in districts if d["level"] == "critical"]
high_plus = [d for d in districts if d["level"] in ("critical", "high")]

def avg(lst, key):
    vals = [d[key] for d in lst if d.get(key) is not None]
    return round(sum(vals) / len(vals), 1) if vals else 0.0

summary = {
    "total_districts":      len(districts),
    "critical_districts":   len(critical),
    "high_districts":       len(high_plus),
    "pop_critical":         sum(d["population"]  for d in critical),
    "pop_high":             sum(d["population"]  for d in high_plus),
    "children_critical":    sum(d["children_u5"] for d in critical),
    "children_high":        sum(d["children_u5"] for d in high_plus),
    "avg_stunting_critical":avg(critical,  "stunting_pct"),
    "avg_wasting_critical": avg(critical,  "wasting_pct"),
    "avg_sanitation_critical":avg(critical,"sanitation"),
    "avg_drought_critical": avg(critical,  "drought"),
    "avg_score_critical":   avg(critical,  "score"),
}

save("client/public/data/elnino.json", {
    "summary":         summary,
    "districts":       districts,
    "state_summaries": state_summaries[:25],
})

print("✓ elnino.json written")
print(f"  Total districts : {len(districts)}")
print(f"  Critical (≥4.0) : {len(critical)}")
print(f"  High (≥2.5)     : {len(high_plus)}")
print(f"  Pop critical    : {summary['pop_critical']:,}")
print(f"  Children critical: {summary['children_critical']:,}")
print()
print("Top 20 districts:")
for d in districts[:20]:
    print(f"  {d['district']:25s} {d['state']:18s}  score={d['score']:.1f}  drought={d['drought']:.1f}  level={d['level']:8s}  pop={d['population']:,}")
print()
print("Top 10 states by avg score:")
for s in state_summaries[:10]:
    print(f"  {s['state']:20s}  avg={s['avg_score']:.1f}  critical={s['critical']}  pop={s['population']:,}")
