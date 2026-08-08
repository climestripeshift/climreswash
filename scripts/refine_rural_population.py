"""
Refine per-hex population in RURAL hexes using real village-level sums from
the Survey of India boundary data (see attach_village_boundaries_to_hexes.py),
replacing the WorldPop 2020 raster-based estimate (scripts/compute_population.py)
where we have solid, plausible village coverage.

Why only rural hexes: SoI's village boundary dataset only covers areas
administratively classified as villages -- dense city cores (Delhi, Bangalore,
Mumbai...) have no "village" polygon at all, they're urban wards. Checked
directly: in "built" land-use hexes, village-sum is sometimes <1% of the real
population (New Delhi district: 128 vs WorldPop's 6.5M). WorldPop is kept for
every "built" hex, no exceptions.

Plausibility gate (rural hexes only): a hex's real village-sum is used only if
it's within 0.2x-5x of the current WorldPop estimate (or unconditionally if
WorldPop's own estimate is under 500 -- too small to give a meaningful ratio,
and village-sum is the more trustworthy number for a specific named place at
that scale anyway). This filters out the small number of hexes where SoI
coverage for that specific hex is clearly incomplete (partial match, boundary
village double-counted elsewhere, etc.) without discarding real corrections
-- national cross-check across 11,323 hexes showed a median ratio of 0.95
between the two sources, so most hexes already agree closely; the gate exists
for the tail, not the median.

Also skips the ~101 hexes where the true village count exceeds the 300-village
cap on india_hex_villages.json's display list -- summing a truncated list
would silently undercount, so those keep the WorldPop figure instead of a
wrong "real" number.

Demographic sub-fields (pop_children_under_5, pop_elderly_60plus,
pop_women_15_49) are recomputed from the new total using the same fixed
Census-2011 ratios compute_population.py uses (0.094 / 0.081 / 0.256) -- SoI's
per-village male/female counts exist in the raw source but weren't carried
through attach_village_boundaries_to_hexes.py's output, so this keeps the
demographic methodology consistent between rural (refined) and urban
(untouched) hexes rather than mixing two different derivations.

IMPORTANT: population feeds exposure_score() directly (see
scripts/risk/formulas.py), which feeds every hazard risk score -- so after
this script runs, you MUST re-run join_hex_districts.py (recomputes risk with
the new population) and then sync_hex_risk_to_props.py (propagates the
recomputed RISK_COLS into india_hex_props.json). This script only patches
population + demographic fields directly into both india_hex_grid.geojson and
india_hex_props.json (matching compute_population.py's own convention of
writing both files) -- it does NOT touch risk numbers itself.

Run: python scripts/refine_rural_population.py
Then: python scripts/join_hex_districts.py && python scripts/sync_hex_risk_to_props.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEX_GEO = ROOT / "client/public/data/india_hex_grid.geojson"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
VILLAGES = ROOT / "client/public/data/india_hex_villages.json"

CHILD_RATIO = 0.094
ELDERLY_RATIO = 0.081
WOMEN_RATIO = 0.256

RATIO_LO, RATIO_HI = 0.2, 5.0
SMALL_POP_THRESHOLD = 500


def village_sum_for(entry: dict) -> float | None:
    """Real total population for a hex's villages, or None if the display list
    is truncated (count > len(villages)) so a full sum isn't available."""
    if entry["count"] > len(entry["villages"]):
        return None
    total = 0.0
    any_real = False
    for v in entry["villages"]:
        pop = v[5]
        if pop is not None:
            total += pop
            any_real = True
    return total if any_real else None


def main():
    print(f"Loading {VILLAGES}...")
    villages = json.loads(VILLAGES.read_text())

    print(f"Loading {HEX_GEO}...")
    geo = json.loads(HEX_GEO.read_text())

    refined = {}  # h3_id -> new_population
    skipped_built, skipped_no_village, skipped_capped, skipped_implausible = 0, 0, 0, 0

    for feat in geo["features"]:
        p = feat["properties"]
        h3_id = p["h3_id"]
        if p.get("land_use") == "built":
            skipped_built += 1
            continue

        entry = villages.get(h3_id)
        if not entry or entry["source"] not in ("soi", "mixed"):
            skipped_no_village += 1
            continue

        vsum = village_sum_for(entry)
        if vsum is None:
            skipped_capped += 1
            continue
        if vsum <= 0:
            skipped_no_village += 1
            continue

        cur = p.get("population", 0) or 0
        if cur >= SMALL_POP_THRESHOLD:
            ratio = vsum / cur
            if not (RATIO_LO <= ratio <= RATIO_HI):
                skipped_implausible += 1
                continue

        refined[h3_id] = vsum

    print(f"\nRefining {len(refined)} rural hexes with solid SoI coverage")
    print(f"  skipped: {skipped_built} built/urban, {skipped_no_village} no usable village data, "
          f"{skipped_capped} village-list truncated (count>300), {skipped_implausible} failed plausibility gate")

    # Patch both files, matching compute_population.py's own convention
    for target_path in (HEX_GEO, HEX_PROPS):
        print(f"\nPatching {target_path}...")
        data = json.loads(target_path.read_text())
        rows = [f["properties"] for f in data["features"]] if "features" in data else data
        updated = 0
        for row in rows:
            h3_id = row.get("h3_id")
            if h3_id not in refined:
                continue
            new_pop = round(refined[h3_id])
            row["population"] = new_pop
            row["pop_children_under_5"] = round(new_pop * CHILD_RATIO)
            row["pop_elderly_60plus"] = round(new_pop * ELDERLY_RATIO)
            row["pop_women_15_49"] = round(new_pop * WOMEN_RATIO)
            updated += 1
        target_path.write_text(json.dumps(data, separators=(",", ":")) if isinstance(data, list)
                                 else json.dumps(data))
        print(f"  {updated} hexes updated")

    print("\nDone. Now re-run: python scripts/join_hex_districts.py && python scripts/sync_hex_risk_to_props.py")


if __name__ == "__main__":
    main()
