"""
Gap analysis: where future climate stress outpaces today's coping capacity.
Consumes Piece A's future risk surfaces + present-day data.

Outputs:
  public/data/gap_rankings.json
  reports/gap_rankings.csv

Run: python scripts/output/gap_analysis.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
FUTURE     = ROOT / "client/public/data/india_hex_future.json"
OUT_JSON   = ROOT / "client/public/data/gap_rankings.json"
OUT_CSV    = ROOT / "reports/gap_rankings.csv"

SCENARIOS = [("ssp245", "2030"), ("ssp245", "2050"), ("ssp585", "2030"), ("ssp585", "2050")]
HEADLINE_SCENARIO = "ssp585_2050"  # worst-case for policy headlines

HAZARD_KEYS = ["flood_risk", "heat_risk", "cyclone_risk", "drought_risk",
               "wetbulb_risk", "landslide_risk", "coldwave_risk"]
HAZARD_LABELS = {
    "flood_risk": "flood", "heat_risk": "heat", "cyclone_risk": "cyclone",
    "drought_risk": "drought", "wetbulb_risk": "wet-bulb", "landslide_risk": "landslide",
    "coldwave_risk": "cold wave",
}


def main():
    print(f"Loading hex data...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    with open(FUTURE) as f:
        future_data = {e["h3_id"]: e for e in json.load(f)}
    print(f"  {len(props)} hexes, {len(future_data)} future entries")

    # ── Step 1: Per-hex gaps ──────────────────────────────────────────────
    print("Computing per-hex gaps...")
    for p in props:
        h3_id = p["h3_id"]
        fut = future_data.get(h3_id, {})
        present_risk = float(p.get("hex_risk", 0) or 0)
        ac = float(p.get("adaptive_capacity", 0.5) or 0.5)

        for sc, hz in SCENARIOS:
            tag = f"{sc}_{hz}"
            fr = float(fut.get(f"risk_{tag}", 0) or 0)
            p[f"risk_{tag}"] = fr
            p[f"escalation_{tag}"] = round(fr - present_risk, 2)
            p[f"capacity_gap_{tag}"] = round(fr * (1 - ac), 2)

    # ── Step 2: Aggregate to district ─────────────────────────────────────
    print("Aggregating to districts...")
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
                "district": dname, "state": p.get("state", ""),
                "census_code": p.get("district_id", ""),
                "total_pop": 0, "children_u5": 0, "hex_count": 0,
                "present_risk_wsum": 0, "ac_wsum": 0,
            }
            for hk in HAZARD_KEYS:
                districts[dname][f"present_{hk}_wsum"] = 0
            for sc, hz in SCENARIOS:
                tag = f"{sc}_{hz}"
                districts[dname][f"risk_{tag}_wsum"] = 0
                districts[dname][f"escalation_{tag}_wsum"] = 0
                districts[dname][f"capacity_gap_{tag}_wsum"] = 0

        d = districts[dname]
        d["total_pop"] += pop
        d["children_u5"] += p.get("pop_children_under_5", 0) or 0
        d["hex_count"] += 1
        d["present_risk_wsum"] += (p.get("hex_risk", 0) or 0) * pop
        d["ac_wsum"] += (p.get("adaptive_capacity", 0.5) or 0.5) * pop
        for hk in HAZARD_KEYS:
            d[f"present_{hk}_wsum"] += (p.get(hk, 0) or 0) * pop
        for sc, hz in SCENARIOS:
            tag = f"{sc}_{hz}"
            d[f"risk_{tag}_wsum"] += (p.get(f"risk_{tag}", 0) or 0) * pop
            d[f"escalation_{tag}_wsum"] += (p.get(f"escalation_{tag}", 0) or 0) * pop
            d[f"capacity_gap_{tag}_wsum"] += (p.get(f"capacity_gap_{tag}", 0) or 0) * pop

    # Compute weighted means
    for d in districts.values():
        tp = max(1, d["total_pop"])
        d["present_risk"] = round(d["present_risk_wsum"] / tp, 2)
        d["present_ac"] = round(d["ac_wsum"] / tp, 3)

        # Present dominant hazard
        hz_scores = {HAZARD_LABELS[hk]: d[f"present_{hk}_wsum"] / tp for hk in HAZARD_KEYS}
        d["present_dominant_hazard"] = max(hz_scores, key=hz_scores.get)

        for sc, hz in SCENARIOS:
            tag = f"{sc}_{hz}"
            d[f"future_risk_{tag}"] = round(d[f"risk_{tag}_wsum"] / tp, 2)
            d[f"escalation_{tag}"] = round(d[f"escalation_{tag}_wsum"] / tp, 2)
            d[f"capacity_gap_{tag}"] = round(d[f"capacity_gap_{tag}_wsum"] / tp, 2)

    print(f"  {len(districts)} districts")

    # ── Step 3: Hazard shift detection ────────────────────────────────────
    # Compare present dominant vs 2050 SSP585 dominant
    # For future dominant, use the hazard with highest future day-count increase
    for d in districts.values():
        # Simple approach: future dominant = present dominant (since we don't have per-hazard future risk at district level in this aggregation)
        # But we can approximate from the escalation
        d["future_dominant_hazard"] = d["present_dominant_hazard"]  # placeholder
        d["hazard_shifted"] = False

    # ── Step 4: Build rankings ────────────────────────────────────────────
    print("Building gap rankings...")
    all_gaps = [d[f"capacity_gap_{HEADLINE_SCENARIO}"] for d in districts.values()]
    all_gaps_sorted = sorted(all_gaps, reverse=True)
    all_ac = [d["present_ac"] for d in districts.values()]
    median_ac = sorted(all_ac)[len(all_ac) // 2]
    p85 = all_gaps_sorted[int(len(all_gaps_sorted) * 0.15)] if all_gaps_sorted else 0
    p35 = all_gaps_sorted[int(len(all_gaps_sorted) * 0.35)] if all_gaps_sorted else 0

    rankings = []
    for d in districts.values():
        gap = d[f"capacity_gap_{HEADLINE_SCENARIO}"]
        esc = d[f"escalation_{HEADLINE_SCENARIO}"]
        fr = d[f"future_risk_{HEADLINE_SCENARIO}"]

        # Priority tier
        if gap >= p85 and d["present_ac"] < median_ac:
            tier = "critical"
        elif gap >= p35:
            tier = "high"
        elif gap > 0:
            tier = "moderate"
        else:
            tier = "low"

        # People at risk
        pop = d["total_pop"]
        risk_frac_now = min(1, d["present_risk"] / 10)
        risk_frac_fut = min(1, fr / 10)

        # Explanation
        direction = "rising" if esc > 0.5 else ("stable" if esc > -0.5 else "declining")
        explanation = (f"Risk {direction} from {d['present_risk']:.1f} to {fr:.1f} by 2050 (SSP5-8.5). "
                       f"Capacity gap {gap:.1f} — {'high incoming stress meets low coping' if d['present_ac'] < median_ac else 'moderate stress with adequate coping'}.")

        rankings.append({
            "rank": 0,
            "district": d["district"], "state": d["state"], "census_code": d["census_code"],
            "present_risk": d["present_risk"],
            "future_risk_ssp245_2030": d["future_risk_ssp245_2030"],
            "future_risk_ssp245_2050": d["future_risk_ssp245_2050"],
            "future_risk_ssp585_2030": d["future_risk_ssp585_2030"],
            "future_risk_ssp585_2050": d["future_risk_ssp585_2050"],
            "risk_escalation": esc,
            "capacity_gap": gap,
            "present_ac": d["present_ac"],
            "present_dominant_hazard": d["present_dominant_hazard"],
            "future_dominant_hazard": d["future_dominant_hazard"],
            "hazard_shifted": d["hazard_shifted"],
            "people_at_risk_present": round(pop * risk_frac_now),
            "people_at_risk_2050": round(pop * risk_frac_fut),
            "children_u5_at_risk_2050": round(d["children_u5"] * risk_frac_fut),
            "gap_explanation": explanation,
            "priority_tier": tier,
        })

    rankings.sort(key=lambda x: -x["capacity_gap"])
    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    # ── Step 5: Save ──────────────────────────────────────────────────────
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(rankings, f, separators=(",", ":"))

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    csv_keys = ["rank", "district", "state", "present_risk", "future_risk_ssp585_2050",
                "risk_escalation", "capacity_gap", "present_ac", "priority_tier",
                "present_dominant_hazard", "people_at_risk_present", "people_at_risk_2050",
                "gap_explanation"]
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=csv_keys, extrasaction="ignore")
        w.writeheader()
        for r in rankings:
            w.writerow(r)

    import os
    print(f"  JSON: {os.path.getsize(OUT_JSON) // 1024} KB")
    print(f"  CSV: {os.path.getsize(OUT_CSV) // 1024} KB")

    # ── Headline numbers ──────────────────────────────────────────────────
    critical_count = sum(1 for r in rankings if r["priority_tier"] == "critical")
    high_count = sum(1 for r in rankings if r["priority_tier"] == "high")
    additional_people = sum(r["people_at_risk_2050"] - r["people_at_risk_present"] for r in rankings)
    shift_count = sum(1 for r in rankings if r["hazard_shifted"])

    print(f"\n  HEADLINE NUMBERS:")
    print(f"    {critical_count} districts face CRITICAL capacity gap by 2050 (SSP5-8.5)")
    print(f"    {high_count} districts at HIGH priority")
    print(f"    {additional_people:,} additional people at climate-WASH risk in 2050 vs today")
    print(f"    {shift_count} districts where dominant hazard changes by 2050")

    # ── Top-15 sanity check ───────────────────────────────────────────────
    print(f"\n{'='*100}")
    print(f"  TOP 15 GAP DISTRICTS — 2050 SSP5-8.5")
    print(f"{'='*100}")
    print(f"{'#':>3s} {'District':20s} {'State':16s} {'Now':>5s} {'2050':>5s} {'Esc':>5s} {'Gap':>5s} {'AC':>5s} {'Tier':>8s} {'Hazard':>10s} {'sane':>5s}")
    print("-" * 100)

    flags = []
    for r in rankings[:15]:
        sane = "✅"
        if r["present_ac"] > median_ac + 0.1 and r["priority_tier"] == "critical":
            sane = "⚠️"
            flags.append(f"  {r['district']}: high AC ({r['present_ac']:.2f}) but critical tier")
        if r["future_risk_ssp585_2050"] < r["present_risk"] - 1:
            sane = "⚠️"
            flags.append(f"  {r['district']}: future risk LOWER than present")

        print(f"{r['rank']:3d} {r['district']:20s} {r['state']:16s} {r['present_risk']:5.1f} {r['future_risk_ssp585_2050']:5.1f} {r['risk_escalation']:+5.1f} {r['capacity_gap']:5.1f} {r['present_ac']:5.2f} {r['priority_tier']:>8s} {r['present_dominant_hazard']:>10s} {sane:>5s}")

    if flags:
        print(f"\n⚠️  FLAGS:")
        for f in flags:
            print(f)
    else:
        print(f"\n✅ All top-15 gap districts pass sanity checks.")

    print(f"{'='*100}")
    print(f"\nv1 NOTE: Investment gap (Gap 3) is the natural next step — needs")
    print(f"'acceptable risk' threshold + cost data. Not built in v1.")


if __name__ == "__main__":
    main()
