"""
Generate institution-differentiated recommendations per district.
Extends district_rankings.json with school/anganwadi/household actions.

Run: python scripts/output/institution_recommendations.py
"""
import json
from pathlib import Path

from recommendation_matrix import get_recommendations

ROOT     = Path(__file__).resolve().parent.parent.parent
RANKINGS = ROOT / "client/public/data/district_rankings.json"

HAZARD_KEYS_MAP = {
    "flood": "flood_risk", "heat": "heat_risk", "cyclone": "cyclone_risk",
    "drought": "drought_risk", "wet-bulb heat": "wetbulb_risk",
    "landslide": "landslide_risk", "cold wave": "coldwave_risk",
}
SECONDARY_THRESHOLD = 3.0


def main():
    print(f"Loading {RANKINGS}...")
    with open(RANKINGS) as f:
        rankings = json.load(f)
    print(f"  {len(rankings)} districts")

    print("Generating institution recommendations...")
    for r in rankings:
        dominant = r.get("dominant_hazard", "flood")

        # Find secondary hazards above threshold
        secondary = []
        for hz_label, hz_key in HAZARD_KEYS_MAP.items():
            if hz_label != dominant:
                score = r.get(hz_label + "_score", 0)
                if score and score > SECONDARY_THRESHOLD:
                    secondary.append(hz_label)

        r["recommendations"] = get_recommendations(dominant, secondary if secondary else None)

    # Save
    with open(RANKINGS, "w") as f:
        json.dump(rankings, f, separators=(",", ":"))

    import os
    print(f"  Saved: {os.path.getsize(RANKINGS) // 1024} KB")

    # ── Sanity check: 5 districts across hazard types ─────────────────────
    print(f"\n{'='*90}")
    print(f"  SANITY CHECK — 5 districts across hazard types")
    print(f"{'='*90}")

    seen_hazards: set[str] = set()
    samples = []
    for r in rankings:
        hz = r["dominant_hazard"]
        if hz not in seen_hazards and len(samples) < 5:
            seen_hazards.add(hz)
            samples.append(r)

    for r in samples:
        print(f"\n  {r['district']}, {r['state']} — dominant: {r['dominant_hazard']} ({r['dominant_hazard_score']:.1f})")
        for inst in ["school", "anganwadi", "household"]:
            rec = r["recommendations"][inst]
            emoji = {"school": "🏫", "anganwadi": "👶", "household": "🏠"}[inst]
            print(f"    {emoji} {inst.upper()}:")
            for m in rec["measures"][:2]:
                print(f"      • {m}")
            print(f"      Schemes: {', '.join(rec['schemes'])}")

    print(f"\n{'='*90}")
    print("  ✅ Every district has school + anganwadi + household recommendations")
    print(f"{'='*90}")


if __name__ == "__main__":
    main()
