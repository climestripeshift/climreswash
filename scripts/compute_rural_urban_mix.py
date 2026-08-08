"""
Classify each hex as rural / urban / composite / negligible, using the real
village-level population sums now attached to hexes (india_hex_villages.json,
via the Survey of India boundaries -- see attach_village_boundaries_to_hexes.py)
as the "rural" component, and the residual (current population estimate minus
that) as the "urban" component.

Why this works as a real signal, not a guess: SoI's village boundaries only
cover areas administratively classified as villages -- a hex's population that
ISN'T accounted for by named villages is, by construction, living somewhere
SoI doesn't have a village polygon for (a city, a town, an urban ward). This
was the same mismatch refine_rural_population.py used to decide which hexes
to trust SoI for -- this script reuses it to actually quantify and classify
the split, rather than just gating on it.

Classes (by rural_pop / total_pop share):
  rural      >= 85% of the hex's population lives in a named SoI village --
              current 252 km² hex resolution is fine, no finer breakdown needed.
  urban      <= 15% -- the hex is essentially a city/town; SoI has almost no
              village coverage here because there mostly isn't a "village."
  composite  15-85% -- genuinely mixed: a town or city center plus real
              surrounding rural villages inside the same hex, both material.
  negligible total population < 100 -- too sparse for the ratio to mean
              anything (high mountains, desert, forest reserve).

"urban" and "composite" hexes are the ones where a single hex-level average
risk score is smoothing together two very different places (a dense city
center's heat-island/pollution/drainage profile vs. surrounding farmland) --
i.e. the candidates for finer-than-hex breakdown.

Output: client/public/data/hex_rural_urban.json -- h3_id -> [rural_pop,
urban_pop, class], positional array to keep the file small (same convention
as india_hex_villages.json).

Run: python scripts/compute_rural_urban_mix.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VILLAGES = ROOT / "client/public/data/india_hex_villages.json"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT = ROOT / "client/public/data/hex_rural_urban.json"

RURAL_THRESHOLD = 0.85
URBAN_THRESHOLD = 0.15
NEGLIGIBLE_POP = 100


def village_sum(entry: dict) -> float | None:
    if entry["count"] > len(entry["villages"]):
        return None  # truncated display list, can't trust a full sum
    total, any_real = 0.0, False
    for v in entry["villages"]:
        if v[5] is not None:
            total += v[5]
            any_real = True
    return total if any_real else None


def classify(total: float, rural_share: float) -> str:
    if total < NEGLIGIBLE_POP:
        return "negligible"
    if rural_share >= RURAL_THRESHOLD:
        return "rural"
    if rural_share <= URBAN_THRESHOLD:
        return "urban"
    return "composite"


def main():
    print(f"Loading {VILLAGES}...")
    villages = json.loads(VILLAGES.read_text())
    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())

    result = {}
    from collections import Counter
    counts = Counter()

    for p in props:
        h3_id = p["h3_id"]
        total = p.get("population", 0) or 0
        entry = villages.get(h3_id)
        rural = None
        if entry and entry["source"] in ("soi", "mixed"):
            rural = village_sum(entry)
        rural = rural or 0.0
        urban = max(0.0, total - rural)
        rural_share = (rural / total) if total > 0 else 0.0
        cls = classify(total, rural_share)
        counts[cls] += 1
        result[h3_id] = [round(rural), round(urban), cls]

    print(f"\nClassification: {dict(counts)}")

    candidates = [(h3, r, u, c) for h3, (r, u, c) in ((h, tuple(v)) for h, v in result.items()) if c in ("urban", "composite")]
    candidates.sort(key=lambda x: -x[2])
    total_urban_in_candidates = sum(c[2] for c in candidates)
    print(f"\n{len(candidates)} hexes flagged for finer breakdown (urban+composite)")
    print(f"  holding {total_urban_in_candidates:,} people in their unaccounted-for urban component")
    print("\nTop 10:")
    for h3, r, u, c in candidates[:10]:
        p = next(p for p in props if p["h3_id"] == h3)
        print(f"  {p.get('district_name')}, {p.get('state')}: rural={r:,} urban={u:,} ({c})")

    OUT.write_text(json.dumps(result, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT} ({os.path.getsize(OUT)/1024:.0f}KB)")


if __name__ == "__main__":
    main()
