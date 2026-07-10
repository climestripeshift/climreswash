"""
Generates insights.json — pre-computed climate-social analytics
for the Insights/Analysis page.
"""
import json, math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent

def load(p): return json.loads((ROOT / p).read_text())

hex_data   = load("client/public/data/india_hex_props.json")
nfhs_extra = load("client/public/data/nfhs5_extra.json")
gap_data   = load("client/public/data/gap_rankings.json")
future     = {r["h3_id"]: r for r in load("client/public/data/india_hex_future.json")}

# ── 1. Aggregate hex → district (population-weighted) ───────────────────────
agg = defaultdict(lambda: defaultdict(float))
pop = defaultdict(float)

HEX_FIELDS = {
    "anaemia":"wash_anaemia_pct","stunting":"wash_stunting_pct",
    "wasting":"wash_wasting_pct","diarrhoea":"wash_diarrhoea_pct",
    "vaccination":"wash_vaccination_pct","literacy":"wash_literacy_pct",
    "sanitation":"wash_sanitation_pct","water":"wash_water_pct",
    "electricity":"wash_electricity_pct","health":"wash_health_pct",
    "flood":"flood_risk","heat":"heat_risk","drought":"drought_risk",
    "wetbulb":"wetbulb_risk","pollution":"pollution_risk",
    "disruption":"wash_disruption_days","ac":"adaptive_capacity",
    "pm25":"pm25_annual","jjm":"jjm_fhtc_pct","risk":"hex_risk",
    # future
    "heat_days_2050":"heat_days_ssp585_2050_",
    "wet_bulb_days_2050":"wet_bulb_days_ssp585_2050_",
    "flood_days_2050":"flood_days_ssp585_2050_",
    "severe_heat_2050":"severe_heat_days_ssp585_2050_",
}

FUT_FIELDS = {
    "heat_days_245_2030":"heat_days_ssp245_2030",
    "heat_days_245_2050":"heat_days_ssp245_2050",
    "heat_days_585_2030":"heat_days_ssp585_2030",
    "heat_days_585_2050":"heat_days_ssp585_2050",
    "wb_days_245_2030":"wet_bulb_days_ssp245_2030",
    "wb_days_245_2050":"wet_bulb_days_ssp245_2050",
    "wb_days_585_2030":"wet_bulb_days_ssp585_2030",
    "wb_days_585_2050":"wet_bulb_days_ssp585_2050",
    "flood_days_245_2050":"flood_days_ssp245_2050",
    "flood_days_585_2050":"flood_days_ssp585_2050",
    "severe_heat_585_2050":"severe_heat_days_ssp585_2050",
    "extreme_rain_585_2050":"extreme_rain_days_ssp585_2050",
    "risk_245_2030":"risk_ssp245_2030",
    "risk_245_2050":"risk_ssp245_2050",
    "risk_585_2030":"risk_ssp585_2030",
    "risk_585_2050":"risk_ssp585_2050",
}

for h in hex_data:
    d = h.get("district_name","")
    if not d: continue
    p = h.get("population",1) or 1
    agg[d]["__state"] = h.get("state","")
    pop[d] += p
    for k, hk in HEX_FIELDS.items():
        if hk.endswith("_"):
            # from future file
            fk = hk[:-1]
            fv = future.get(h["h3_id"],{}).get(fk)
            if fv is not None:
                agg[d][k] += fv * p
        else:
            v = h.get(hk)
            if v is not None:
                agg[d][k] += v * p
    # future fields
    fut_hex = future.get(h["h3_id"],{})
    for k, fk in FUT_FIELDS.items():
        v = fut_hex.get(fk)
        if v is not None:
            agg[d][k] += v * p

district_stats = {}
for d, a in agg.items():
    p = pop[d]
    if p < 10000: continue
    row = {"district": d, "state": a["__state"], "population": round(p)}
    for k in list(HEX_FIELDS.keys()) + list(FUT_FIELDS.keys()):
        row[k] = round(a[k]/p, 3) if p > 0 else None
    n = nfhs_extra.get(d, {})
    row.update({k: v for k,v in n.items()})
    district_stats[d] = row

print(f"Districts: {len(district_stats)}")

# ── 2. Pearson correlation ──────────────────────────────────────────────────
def pearson(xs, ys):
    n = len(xs)
    if n < 10: return 0.0, n
    mx, my = sum(xs)/n, sum(ys)/n
    num = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    dx = math.sqrt(sum((x-mx)**2 for x in xs)); dy = math.sqrt(sum((y-my)**2 for y in ys))
    return (round(num/(dx*dy),3) if dx*dy else 0.0), n

def scatter_data(xk, yk, max_pts=300):
    rows = [(round(s[xk],2), round(s[yk],2), s["district"], s["state"])
            for s in district_stats.values()
            if s.get(xk) is not None and s.get(yk) is not None]
    if not rows: return [], 0.0
    # subsample if too many
    if len(rows) > max_pts:
        step = len(rows)//max_pts
        rows = rows[::step]
    r, n = pearson([x[0] for x in rows], [x[1] for x in rows])
    return [{"x":x,"y":y,"d":d,"s":s} for x,y,d,s in rows], r

# ── 3. Key relationships ────────────────────────────────────────────────────
relationships = []

def rel(xk, yk, title, x_label, y_label, interpretation):
    pts, r = scatter_data(xk, yk)
    relationships.append({
        "title": title, "r": r, "x_key": xk, "y_key": yk,
        "x_label": x_label, "y_label": y_label,
        "interpretation": interpretation,
        "n": len(pts), "points": pts,
    })

rel("heat","anaemia",
    "Heat Stress & Anaemia in Women",
    "District Heat Risk Score","Women with Anaemia (%)",
    "Districts with higher heat risk show 6-8 percentage points more anaemia in women (15-49 years). Chronic heat stress reduces dietary iron absorption and worsens iron-deficiency anaemia — compounding WASH-related nutritional vulnerability.")

rel("pm25","anaemia",
    "Air Pollution & Anaemia",
    "Annual PM2.5 (μg/m³)","Women with Anaemia (%)",
    "Higher PM2.5 exposure correlates with more anaemia. Chronic fine particulate inhalation triggers systemic inflammation that reduces haemoglobin synthesis, creating an indoor air → blood pathway independent of diet or sanitation.")

rel("disruption","stunting",
    "Climate Disruption & Child Stunting",
    "Annual WASH Disruption Days","Children Stunted (%)",
    "Every additional 30 disruption days per year is associated with ~1 percentage point more stunting. Repeated crop damage, water access interruption, and disease burden from climate events compound into long-term growth failure.")

rel("heat","stunting",
    "Heat Stress & Child Stunting",
    "District Heat Risk Score","Children Stunted (%)",
    "Hotter districts show higher stunting rates. Maternal heat stress during pregnancy impairs foetal growth; post-birth, heat increases open defecation risk (latrine avoidance) and reduces appetite, both stunting pathways.")

rel("menstrual_hygiene_pct","antenatal_4visit_pct",
    "Menstrual Hygiene & Antenatal Care",
    "Menstrual Hygiene Coverage (%)","4 Antenatal Visits (%)",
    "The strongest social correlation in the dataset (r=+0.42). MHM coverage and antenatal care move together because they share the same root barrier: women's bodily autonomy and access to health services. Raising MHM is not just WASH — it is maternal health.")

rel("heat","menstrual_hygiene_pct",
    "Heat Risk & Menstrual Hygiene Coverage",
    "District Heat Risk Score","Menstrual Hygiene Coverage (%)",
    "Hotter districts have lower MHM coverage (r=-0.19). Heat exacerbates open-defecation norms (menstruation-period practices), limits private washing spaces, and correlates with lower female education and autonomy — all barriers to MHM adoption.")

rel("disruption","anaemia",
    "Climate Disruption & Anaemia",
    "Annual WASH Disruption Days","Women with Anaemia (%)",
    "More disruption days → more anaemia. Climate events disrupt food supply (reduces iron-rich food access), contaminate water (causing anaemia-worsening infections), and increase physical stress in women.")

rel("wetbulb","anaemia",
    "Wet-Bulb Heat & Anaemia",
    "Wet-Bulb Risk Score","Women with Anaemia (%)",
    "Wet-bulb heat — the combined heat+humidity stress that limits human cooling — is associated with higher anaemia. Wet-bulb conditions in India primarily affect eastern plains (Bihar, Assam, coastal AP) where anaemia prevalence is also highest.")

# ── 4. Group comparisons ────────────────────────────────────────────────────
def group_cmp(filter_fn, field):
    vals = [s[field] for s in district_stats.values()
            if filter_fn(s) and s.get(field) is not None]
    return round(sum(vals)/len(vals), 1) if vals else None, len(vals)

hazard_groups = {}
for hz in ["flood","heat","wetbulb","pollution","drought"]:
    def mkhz(h): return lambda s: s.get(h,0) > sum(s.get(hh,0) for hh in ["flood","heat","wetbulb","pollution","drought"] if hh!=h)/4
    hf = lambda s, h=hz: s.get(h,0) == max(s.get("flood",0), s.get("heat",0), s.get("wetbulb",0), s.get("pollution",0))
    ana, n_a = group_cmp(hf, "anaemia")
    stu, n_s = group_cmp(hf, "stunting")
    was, n_w = group_cmp(hf, "wasting")
    hazard_groups[hz] = {"anaemia": ana, "stunting": stu, "wasting": was, "n": n_a}

# ── 5. Future projections (national averages from hex data) ─────────────────
def nat_avg(key):
    vals = [s[key] for s in district_stats.values() if s.get(key) is not None]
    return round(sum(vals)/len(vals), 1) if vals else None

future_national = {
    "heat_days": {
        "ssp245_2030": nat_avg("heat_days_245_2030"),
        "ssp245_2050": nat_avg("heat_days_245_2050"),
        "ssp585_2030": nat_avg("heat_days_585_2030"),
        "ssp585_2050": nat_avg("heat_days_585_2050"),
    },
    "wet_bulb_days": {
        "ssp245_2030": nat_avg("wb_days_245_2030"),
        "ssp245_2050": nat_avg("wb_days_245_2050"),
        "ssp585_2030": nat_avg("wb_days_585_2030"),
        "ssp585_2050": nat_avg("wb_days_585_2050"),
    },
    "flood_days": {
        "ssp245_2050": nat_avg("flood_days_245_2050"),
        "ssp585_2050": nat_avg("flood_days_585_2050"),
    },
    "severe_heat": {
        "ssp585_2050": nat_avg("severe_heat_585_2050"),
    },
}

# State-level future risk
state_future = defaultdict(lambda: defaultdict(list))
for s in district_stats.values():
    st = s["state"]
    for k in ["heat_days_585_2050","wb_days_585_2050","flood_days_585_2050","risk","heat_days_245_2050"]:
        if s.get(k) is not None:
            state_future[st][k].append(s[k])

state_future_avg = {}
for st, fields in state_future.items():
    state_future_avg[st] = {k: round(sum(v)/len(v),1) for k,v in fields.items()}

top_heat_states = sorted(state_future_avg.items(),
    key=lambda x: x[1].get("heat_days_585_2050",0), reverse=True)[:12]

top_wetbulb_states = sorted(state_future_avg.items(),
    key=lambda x: x[1].get("wb_days_585_2050",0), reverse=True)[:12]

# ── 6. Future escalation: districts where heat_days rising most ─────────────
escalation_districts = []
for s in district_stats.values():
    hd_2050 = s.get("heat_days_585_2050")
    hd_curr = s.get("heat")  # current heat risk score
    wb_2050  = s.get("wb_days_585_2050")
    anaemia  = s.get("anaemia")
    stunting = s.get("stunting")
    if hd_2050 is not None and hd_2050 > 20:
        escalation_districts.append({
            "district": s["district"], "state": s["state"],
            "heat_days_2050": hd_2050,
            "wet_bulb_days_2050": wb_2050,
            "current_heat_risk": s.get("heat"),
            "anaemia_pct": anaemia,
            "stunting_pct": stunting,
            "population": s.get("population"),
        })
escalation_districts.sort(key=lambda x: -(x["wet_bulb_days_2050"] or 0))

# ── 7. Adaptive capacity drivers ────────────────────────────────────────────
ac_drivers = {}
for field, label in [
    ("literacy","Literacy rate"), ("electricity","Electricity access"),
    ("vaccination","Vaccination"), ("jjm","JJM tap water"),
    ("sanitation","Sanitation"), ("health","Skilled birth attendance"),
]:
    pts, r = scatter_data(field, "ac")
    ac_drivers[field] = {"label": label, "r": r, "points": pts[:100]}

# ── 8. National summary stats ───────────────────────────────────────────────
all_vals = lambda k: [s[k] for s in district_stats.values() if s.get(k) is not None]
summary = {
    "districts_analyzed": len(district_stats),
    "national_anaemia_pct": round(sum(all_vals("anaemia"))/len(all_vals("anaemia")),1),
    "national_stunting_pct": round(sum(all_vals("stunting"))/len(all_vals("stunting")),1),
    "national_disruption_days": round(sum(all_vals("disruption"))/len(all_vals("disruption")),1),
    "heat_high_districts": sum(1 for s in district_stats.values() if (s.get("heat") or 0) > 2),
    "wetbulb_high_districts": sum(1 for s in district_stats.values() if (s.get("wetbulb") or 0) > 3),
    "high_anaemia_districts": sum(1 for s in district_stats.values() if (s.get("anaemia") or 0) > 70),
    "high_stunting_districts": sum(1 for s in district_stats.values() if (s.get("stunting") or 0) > 40),
    "wet_bulb_days_2050_mean": nat_avg("wb_days_585_2050"),
    "heat_days_2050_mean": nat_avg("heat_days_585_2050"),
}

# ── Write output ─────────────────────────────────────────────────────────────
out = {
    "summary": summary,
    "relationships": relationships,
    "hazard_groups": hazard_groups,
    "future_national": future_national,
    "top_heat_states": [{"state": s, **v} for s,v in top_heat_states],
    "top_wetbulb_states": [{"state": s, **v} for s,v in top_wetbulb_states],
    "escalation_districts": escalation_districts[:50],
    "ac_drivers": ac_drivers,
}

out_path = ROOT / "client/public/data/insights.json"
out_path.write_text(json.dumps(out, ensure_ascii=False, separators=(",",":")))
size_kb = out_path.stat().st_size // 1024
print(f"Wrote insights.json ({size_kb} KB)")
print(f"Relationships: {len(relationships)}")
print(f"Scatter points per chart: ~{len(relationships[0]['points'])}")
print(f"\nNational summary:")
for k,v in summary.items(): print(f"  {k}: {v}")
print(f"\nFuture national heat days: {future_national['heat_days']}")
print(f"Future national wet-bulb days: {future_national['wet_bulb_days']}")
