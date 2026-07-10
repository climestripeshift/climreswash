"""
Generates decision_matrix.json — a joined, gap-annotated district dataset
for the District Screener / prioritization table.

Output: client/public/data/decision_matrix.json
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

def load(rel):
    return json.loads((ROOT / rel).read_text())

rankings  = {r["district"]: r for r in load("client/public/data/district_rankings.json")}
gap_data  = {d["district"]: d for d in load("client/public/data/gap_rankings.json")}
jjm_raw   = load("client/public/data/jjm_district_fhtc.json")
sbm_raw   = load("client/public/data/sbm_toilet_types.json")
nfhs      = load("client/public/data/nfhs5_extra.json")

jjm_by_dist = {v["district"].upper(): v for v in jjm_raw.values()}

def get_jjm(district):
    return jjm_by_dist.get(district.upper())

def get_sbm(state, district):
    key = f"{state.upper()}|{district.upper()}"
    return sbm_raw.get(key)

def intervention_text(gap, data):
    d = data
    if gap == "flood-toilet":
        ihhl = d.get("total_ihhl")
        tp = d.get("twin_pit_pct", 0)
        s = f"Retrofit single-pit toilets to twin-pit (only {tp:.0f}% twin-pit)"
        if ihhl:
            s += f" — {ihhl:,} IHHL"
        return s
    if gap == "water-gap":
        pct = d.get("jjm_fhtc_pct", 0)
        return f"Expand JJM FHTC connections ({pct:.0f}% household tap coverage)"
    if gap == "MHM":
        return f"Menstrual hygiene management program ({d.get('menstrual_hygiene_pct', 0):.0f}% coverage)"
    if gap == "clean-fuel":
        return f"PM Ujjwala clean fuel scale-up ({d.get('clean_fuel_pct', 0):.0f}% access)"
    if gap == "child-marriage":
        return f"Early marriage prevention — Beti Bachao initiative ({d.get('child_marriage_pct', 0):.0f}% prevalence)"
    if gap == "antenatal":
        return f"Antenatal care program (only {d.get('antenatal_4visit_pct', 0):.0f}% 4-visit coverage)"
    if gap == "ORS":
        return f"ORS & diarrhoea response training ({d.get('ors_diarrhoea_pct', 0):.0f}% ORS use)"
    return gap

GAP_PRIORITY = ["flood-toilet", "water-gap", "MHM", "clean-fuel", "child-marriage", "antenatal", "ORS"]

results = []

for dist_name, g in gap_data.items():
    r = rankings.get(dist_name, {})
    n = nfhs.get(dist_name, {})
    j = get_jjm(dist_name)
    sb = get_sbm(g["state"], dist_name)

    hazard = g.get("present_dominant_hazard", "")
    is_flood = hazard in ("flood", "flash flood", "cyclone")

    jjm_pct    = j["fhtc_pct"] if j else None
    twin_pit   = sb.get("twin_pit_pct") if sb else None
    single_pit = sb.get("single_pit_pct") if sb else None
    total_ihhl = sb.get("total_ihhl") if sb else None
    mhm        = n.get("menstrual_hygiene_pct")
    clean_fuel = n.get("clean_fuel_pct")
    child_marr = n.get("child_marriage_pct")
    antenatal  = n.get("antenatal_4visit_pct")
    ors        = n.get("ors_diarrhoea_pct")
    health_ins = n.get("health_insurance_pct")
    ari        = n.get("ari_prevalence_pct")

    row = {
        "district": dist_name,
        "state": g["state"],
        "census_code": g.get("census_code"),
        "risk": round(g.get("present_risk", 0), 2),
        "dominant_hazard": hazard,
        "priority_tier": g.get("priority_tier", ""),
        "capacity_gap": round(g.get("capacity_gap", 0), 2),
        "risk_escalation": round(g.get("risk_escalation", 0), 2),
        "future_risk_2050": round(g.get("future_risk_ssp585_2050", 0), 2),
        "people_at_risk": g.get("people_at_risk_present"),
        "people_at_risk_2050": g.get("people_at_risk_2050"),
        "children_u5_2050": g.get("children_u5_at_risk_2050"),
        # JJM
        "jjm_fhtc_pct": jjm_pct,
        # SBM
        "twin_pit_pct": twin_pit,
        "single_pit_pct": single_pit,
        "total_ihhl": total_ihhl,
        # NFHS5
        "menstrual_hygiene_pct": mhm,
        "clean_fuel_pct": clean_fuel,
        "child_marriage_pct": child_marr,
        "antenatal_4visit_pct": antenatal,
        "ors_diarrhoea_pct": ors,
        "health_insurance_pct": health_ins,
        "ari_prevalence_pct": ari,
        # From rankings
        "wash_sanitation_pct": r.get("wash_sanitation_pct"),
        "wash_disruption_days": r.get("wash_disruption_days"),
        "population_at_risk": r.get("population_at_risk"),
        "adaptive_capacity": r.get("adaptive_capacity"),
    }

    # Gap detection
    gaps = []
    if is_flood and twin_pit is not None and twin_pit < 30:
        gaps.append("flood-toilet")
    if jjm_pct is not None and jjm_pct < 60:
        gaps.append("water-gap")
    if mhm is not None and mhm < 55:
        gaps.append("MHM")
    if clean_fuel is not None and clean_fuel < 35:
        gaps.append("clean-fuel")
    if child_marr is not None and child_marr > 30:
        gaps.append("child-marriage")
    if antenatal is not None and antenatal < 50:
        gaps.append("antenatal")
    if ors is not None and ors < 50:
        gaps.append("ORS")

    # Sort gaps by priority order
    gaps = [g2 for g2 in GAP_PRIORITY if g2 in gaps]

    row["gaps"] = gaps
    row["gap_count"] = len(gaps)
    row["interventions"] = [intervention_text(g2, row) for g2 in gaps]
    row["primary_intervention"] = row["interventions"][0] if row["interventions"] else None

    # Composite gap score for sorting: risk × (1 + 0.15 × gap_count)
    row["gap_score"] = round(row["risk"] * (1 + 0.15 * len(gaps)), 2)

    results.append(row)

# Sort by gap_score descending
results.sort(key=lambda x: -x["gap_score"])

out_path = ROOT / "client/public/data/decision_matrix.json"
out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
print(f"Wrote {len(results)} districts → {out_path}")

# Summary stats
gap_counts = {}
for g2 in GAP_PRIORITY:
    n2 = sum(1 for r in results if g2 in r["gaps"])
    gap_counts[g2] = n2
print("\nGap distribution:")
for g2, n2 in sorted(gap_counts.items(), key=lambda x: -x[1]):
    print(f"  {g2}: {n2} districts")
critical = [r for r in results if r["priority_tier"] in ("critical","high") and r["gap_count"] >= 2]
print(f"\nCritical/high tier with 2+ gaps: {len(critical)}")
print(f"Total districts: {len(results)}")
