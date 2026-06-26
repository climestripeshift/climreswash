"""
Produce ranked district list with WHY + RECOMMENDATION per district.
Reads existing hex risk scores — does NOT recompute risk.

Outputs:
  public/data/district_rankings.json
  reports/district_rankings.csv

Run: python scripts/output/rank_and_explain.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
OUT_JSON   = ROOT / "client/public/data/district_rankings.json"
OUT_CSV    = ROOT / "reports/district_rankings.csv"

HAZARD_KEYS = ["flood_risk", "heat_risk", "cyclone_risk", "drought_risk",
               "wetbulb_risk", "landslide_risk", "coldwave_risk"]
HAZARD_LABELS = {
    "flood_risk": "flood", "heat_risk": "heat", "cyclone_risk": "cyclone",
    "drought_risk": "drought", "wetbulb_risk": "wet-bulb heat",
    "landslide_risk": "landslide", "coldwave_risk": "cold wave",
}
HAZARD_ICONS = {
    "flood": "🌊", "heat": "🔥", "cyclone": "🌀", "drought": "☀️",
    "wet-bulb heat": "💧", "landslide": "🏔️", "cold wave": "❄️",
}

# ── Recommendation lookup (dominant hazard × top vulnerability) ────────────────
RECOMMENDATIONS = {
    ("flood", "poor sanitation"):       "Upgrade to flood-resilient sealed sanitation (DEWATS/sealed septic); protect water sources from contamination.",
    ("flood", "low adaptive capacity"): "Strengthen drainage + emergency WASH response capacity; pre-position ORS and water purification supplies.",
    ("flood", "poor water access"):     "Protect water infrastructure from flood damage; deploy emergency tanker supply protocol.",
    ("flood", "high exposure"):         "Prioritise flood early warning for dense settlements; child-safe evacuation points.",
    ("drought", "groundwater stress"):  "Shift from groundwater to surface/multi-village schemes; aquifer recharge structures; demand management.",
    ("drought", "poor water access"):   "Expand piped supply from drought-resilient sources; rainwater harvesting; reduce water losses.",
    ("drought", "low adaptive capacity"): "MGNREGA drought works; fodder camps; expedite crop insurance. Strengthen water storage.",
    ("heat", "low adaptive capacity"):  "Heat-action plans; public cooling shelters; ensure water supply continuity during heatwaves.",
    ("heat", "high exposure"):          "Prioritise vulnerable groups (elderly, children under 5); cooling + hydration access points.",
    ("heat", "poor sanitation"):        "Heat compounds sanitation disease; ensure toilet ventilation and handwashing water availability.",
    ("wet-bulb heat", "high exposure"): "Restrict outdoor labour during high wet-bulb days; deploy mobile health units with IV fluids.",
    ("wet-bulb heat", "low adaptive capacity"): "Stock cooling equipment at PHCs; community wet-bulb awareness campaigns.",
    ("cyclone", "poor sanitation"):     "Cyclone-resilient WASH infrastructure; protect coastal water sources from salinity intrusion.",
    ("cyclone", "high sensitivity"):    "Strengthen coastal infrastructure; pre-position emergency WASH kits; evacuation route planning.",
    ("cold wave", "low adaptive capacity"): "Distribute blankets and warm clothing; open night shelters; ensure hot water supply.",
    ("cold wave", "high exposure"):     "Targeted protection for elderly and children; heated community spaces.",
    ("landslide", "low adaptive capacity"): "Pre-position rescue equipment; community early warning via voice messages; slope stabilisation.",
}

# Per-hazard fallbacks
HAZARD_FALLBACK = {
    "flood":        "Strengthen flood-resilient WASH infrastructure; pre-position emergency supplies; improve drainage.",
    "heat":         "Implement heat-action plan; ensure water supply continuity; protect vulnerable populations.",
    "drought":      "Diversify water sources; rainwater harvesting; demand management; MGNREGA drought works.",
    "cyclone":      "Cyclone-resilient infrastructure; pre-position emergency WASH kits; evacuation planning.",
    "wet-bulb heat":"Restrict outdoor labour on high wet-bulb days; mobile health units; community awareness.",
    "cold wave":    "Night shelters; blanket distribution; hot meal programmes; protect water pipes from freezing.",
    "landslide":    "Slope stabilisation; community early warning; pre-positioned rescue equipment.",
}


def main():
    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # ── Step 1: Aggregate to districts (population-weighted) ──────────────
    print("Aggregating to districts...")
    districts: dict[str, dict] = {}

    for p in props:
        dname = p.get("district_name", "")
        if not dname or dname == "Unknown":
            continue
        pop = p.get("population", 0) or 0

        if dname not in districts:
            districts[dname] = {
                "district": dname,
                "state": p.get("state", ""),
                "district_id": p.get("district_id", ""),
                "total_pop": 0,
                "children_under5": 0,
                "elderly_60plus": 0,
                "hex_count": 0,
                "wash_sanitation_sum": 0,
                "wash_water_sum": 0,
                "gw_stress_sum": 0,
                "ac_sum": 0,
                "disruption_days_sum": 0,
            }
            for hk in HAZARD_KEYS + ["hex_risk"]:
                districts[dname][f"{hk}_wsum"] = 0.0

        d = districts[dname]
        d["total_pop"] += pop
        d["children_under5"] += p.get("pop_children_under_5", 0) or 0
        d["elderly_60plus"] += p.get("pop_elderly_60plus", 0) or 0
        d["hex_count"] += 1
        d["wash_sanitation_sum"] += (p.get("wash_sanitation_pct", 0) or 0) * max(1, pop)
        d["wash_water_sum"] += (p.get("wash_water_pct", 0) or 0) * max(1, pop)
        d["gw_stress_sum"] += (p.get("gw_stress_score", 0) or 0) * max(1, pop)
        d["ac_sum"] += (p.get("adaptive_capacity", 0) or 0) * max(1, pop)
        d["disruption_days_sum"] += (p.get("wash_disruption_days", 0) or 0) * max(1, pop)
        for hk in HAZARD_KEYS + ["hex_risk"]:
            d[f"{hk}_wsum"] += (p.get(hk, 0) or 0) * max(1, pop)

    # Compute weighted means
    for d in districts.values():
        tp = max(1, d["total_pop"])
        d["risk_score"] = round(d["hex_risk_wsum"] / tp, 2)
        d["wash_sanitation"] = round(d["wash_sanitation_sum"] / tp, 1)
        d["wash_water"] = round(d["wash_water_sum"] / tp, 1)
        d["gw_stress"] = round(d["gw_stress_sum"] / tp, 3)
        d["adaptive_capacity"] = round(d["ac_sum"] / tp, 3)
        d["disruption_days"] = round(d["disruption_days_sum"] / tp, 1)
        for hk in HAZARD_KEYS:
            d[HAZARD_LABELS[hk] + "_score"] = round(d[f"{hk}_wsum"] / tp, 2)

    print(f"  {len(districts)} districts")

    # ── Step 2: Compute national medians for deviation ────────────────────
    all_d = list(districts.values())
    def median(key):
        vals = sorted(d.get(key, 0) for d in all_d)
        return vals[len(vals) // 2] if vals else 0

    med_ac = median("adaptive_capacity")
    med_sanit = median("wash_sanitation")
    med_water = median("wash_water")

    # ── Step 3: Why + recommendation per district ─────────────────────────
    print("Computing explanations + recommendations...")
    rankings = []

    for d in all_d:
        # Dominant hazard
        hazard_scores = {HAZARD_LABELS[hk]: d.get(HAZARD_LABELS[hk] + "_score", 0) for hk in HAZARD_KEYS}
        dominant_hz = max(hazard_scores, key=hazard_scores.get)
        dominant_score = hazard_scores[dominant_hz]

        # Vulnerability factors (deviation from national median)
        vuln_factors = []
        if d["adaptive_capacity"] < med_ac - 0.05:
            vuln_factors.append(("low adaptive capacity", round(med_ac - d["adaptive_capacity"], 2)))
        if d["wash_sanitation"] < med_sanit - 5:
            vuln_factors.append(("poor sanitation", round(med_sanit - d["wash_sanitation"], 1)))
        if d["wash_water"] < med_water - 5:
            vuln_factors.append(("poor water access", round(med_water - d["wash_water"], 1)))
        if d["gw_stress"] > 0.5:
            vuln_factors.append(("groundwater stress", round(d["gw_stress"], 2)))
        if d["total_pop"] > 1000000:
            vuln_factors.append(("high exposure", round(d["total_pop"] / 1e6, 1)))

        vuln_factors.sort(key=lambda x: -x[1])
        top_vulns = vuln_factors[:2]

        # Explanation
        vuln_text = ""
        if top_vulns:
            parts = []
            for vname, vval in top_vulns:
                if vname == "poor sanitation":
                    parts.append(f"poor sanitation ({d['wash_sanitation']:.0f}%)")
                elif vname == "poor water access":
                    parts.append(f"poor water access ({d['wash_water']:.0f}%)")
                elif vname == "groundwater stress":
                    parts.append(f"groundwater stress ({d['gw_stress']:.2f})")
                elif vname == "high exposure":
                    parts.append(f"high population ({vval:.1f}M)")
                else:
                    parts.append(vname)
            vuln_text = " compounded by " + " and ".join(parts)

        explanation = f"High {dominant_hz} hazard ({dominant_score:.1f}){vuln_text}."

        # Recommendation
        top_vuln_name = top_vulns[0][0] if top_vulns else "low adaptive capacity"
        rec = RECOMMENDATIONS.get((dominant_hz, top_vuln_name))
        if not rec:
            rec = HAZARD_FALLBACK.get(dominant_hz, "Strengthen climate-resilient WASH infrastructure.")

        rankings.append({
            "district": d["district"],
            "state": d["state"],
            "census_code": d.get("district_id", ""),
            "risk_score": d["risk_score"],
            "dominant_hazard": dominant_hz,
            "dominant_hazard_icon": HAZARD_ICONS.get(dominant_hz, "⚠️"),
            "dominant_hazard_score": dominant_score,
            "top_vulnerabilities": [f"{v[0]} ({v[1]})" for v in top_vulns],
            "explanation": explanation,
            "recommendation": rec,
            "population_at_risk": d["total_pop"],
            "children_under5_at_risk": d["children_under5"],
            "elderly_at_risk": d["elderly_60plus"],
            "adaptive_capacity": d["adaptive_capacity"],
            "wash_sanitation_pct": d["wash_sanitation"],
            "wash_disruption_days": d["disruption_days"],
        })

    rankings.sort(key=lambda x: -x["risk_score"])
    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    # ── Step 4: Save ──────────────────────────────────────────────────────
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(rankings, f, separators=(",", ":"))
    print(f"  JSON: {OUT_JSON} ({len(rankings)} districts)")

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    csv_keys = ["rank", "district", "state", "risk_score", "dominant_hazard",
                "dominant_hazard_score", "explanation", "recommendation",
                "population_at_risk", "children_under5_at_risk", "adaptive_capacity",
                "wash_sanitation_pct", "wash_disruption_days"]
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=csv_keys, extrasaction="ignore")
        w.writeheader()
        for r in rankings:
            w.writerow(r)
    print(f"  CSV: {OUT_CSV}")

    # ── Step 5: Top-15 sanity check ───────────────────────────────────────
    print(f"\n{'='*90}")
    print(f"  TOP 15 DISTRICTS BY RISK — SANITY CHECK")
    print(f"{'='*90}")
    print(f"{'#':>3s} {'District':22s} {'State':18s} {'Risk':>5s} {'Hazard':12s} {'Score':>5s} {'Vuln':30s}")
    print("-" * 90)

    # Known climate associations for flagging
    EXPECTED = {
        "flood": {"Assam", "Bihar", "West Bengal", "Odisha", "Kerala", "Uttar Pradesh"},
        "heat": {"Rajasthan", "Gujarat", "Madhya Pradesh", "Maharashtra", "Telangana", "Andhra Pradesh"},
        "drought": {"Rajasthan", "Gujarat", "Maharashtra", "Karnataka", "Madhya Pradesh"},
        "cyclone": {"Odisha", "Andhra Pradesh", "Tamil Nadu", "West Bengal"},
        "cold wave": {"Jammu And Kashmir", "Himachal Pradesh", "Uttarakhand", "Ladakh"},
    }

    flags = []
    for r in rankings[:15]:
        hz = r["dominant_hazard"]
        state = r["state"]
        vuln_str = ", ".join(r["top_vulnerabilities"][:2]) if r["top_vulnerabilities"] else "—"
        flag = ""
        expected_states = EXPECTED.get(hz, set())
        if expected_states and state not in expected_states:
            flag = " ⚠️ CHECK"
            flags.append(f"  {r['district']}, {state}: dominant={hz} — expected in {expected_states}")
        print(f"{r['rank']:3d} {r['district']:22s} {state:18s} {r['risk_score']:5.2f} {HAZARD_ICONS.get(hz,'')}{hz:10s} {r['dominant_hazard_score']:5.2f} {vuln_str:30s}{flag}")

    if flags:
        print(f"\n⚠️  FLAGGED — dominant hazard unexpected for state:")
        for f in flags:
            print(f)
    else:
        print(f"\n✅ All top-15 dominant hazards are geographically plausible.")

    print(f"{'='*90}")


if __name__ == "__main__":
    main()
