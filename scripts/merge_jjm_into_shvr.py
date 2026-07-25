"""
Merge the JJM tap-water/sanitation dataset onto the unified SHVR/CSR
school registry, so a single school record carries: star rating (verified
+ self-reported), toilet/repair/classroom/dilapidated needs (CSR), AND
tap water/hand-washing/toilet-water/etc (JJM) — one combined source
instead of three separate ones.

Neither JJM nor the CSR toilet file has a usable UDISE code, so this is
NAME-matched, same confidence tier as the toilet-requirement join. Scoped
by (current district, block) where both sides have a block — SHVR schools
got a Block field from the self-reported injection (scripts/
inject_shvr_self_reported.py), covering ~50,700 of 72,516. Falls back to
district-only matching (higher bar, since the candidate pool is bigger)
for the rest.

Idempotent, self-referencing like join_shvr_infrastructure_needs.py:
reads/writes client/public/data/shvr_schools_infra_rajasthan.json
directly, resetting its own jjm_* fields each run.

Run: python scripts/merge_jjm_into_shvr.py
"""
import difflib
import json
import re
from collections import defaultdict
from pathlib import Path

from join_shvr_infrastructure_needs import canonical_district

ROOT = Path(__file__).resolve().parent.parent
JJM_SCHOOLS = ROOT / "client/public/data/jjm_schools_rajasthan.json"
SCHOOLS = OUT_SCHOOLS = ROOT / "client/public/data/shvr_schools_infra_rajasthan.json"
OUT_SUMMARY = ROOT / "client/public/data/jjm_shvr_merge_summary.json"

BLOCK_THRESHOLD = 0.82   # same bar as the toilet-file name match
DISTRICT_THRESHOLD = 0.90  # stricter fallback -- much bigger candidate pool, higher collision risk

JJM_FIELDS = ["tap_water", "toilet_running_water", "hand_washing",
              "separate_toilets_girls_boys", "rainwater_harvesting",
              "dried_toilets", "grey_water_mgmt"]


def norm_name(v) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", str(v or "").upper())


def norm_block(v) -> str:
    return re.sub(r"[^A-Z]", "", str(v or "").upper())


def best_match(target_norm: str, candidates: list[dict]) -> tuple[dict | None, float]:
    # exact-name fast path -- resolves a large share of rows without any fuzzy scoring
    for c in candidates:
        if c["_norm_name"] == target_norm:
            return c, 1.0
    # length pre-filter: SequenceMatcher.ratio for two strings whose lengths differ by more
    # than half the longer one can't clear a 0.8+ threshold, so skip those comparisons entirely
    tlen = len(target_norm)
    best, best_score = None, 0.0
    sm = difflib.SequenceMatcher(None)
    sm.set_seq2(target_norm)
    for c in candidates:
        clen = len(c["_norm_name"])
        if clen == 0 or abs(clen - tlen) / max(clen, tlen) > 0.4:
            continue
        sm.set_seq1(c["_norm_name"])
        if sm.real_quick_ratio() <= best_score or sm.quick_ratio() <= best_score:
            continue
        score = sm.ratio()
        if score > best_score:
            best, best_score = c, score
    return best, best_score


def main():
    if not JJM_SCHOOLS.exists():
        print(f"JJM source not found: {JJM_SCHOOLS} -- run scripts/build_jjm_schools.py first")
        return

    print(f"Loading {JJM_SCHOOLS}...")
    jjm = json.loads(JJM_SCHOOLS.read_text())
    print(f"  {len(jjm)} JJM facilities")

    print(f"Loading {SCHOOLS}...")
    schools = json.loads(SCHOOLS.read_text())
    print(f"  {len(schools)} schools already on file")

    for s in schools:
        for f in JJM_FIELDS:
            s[f] = None
        s["jjm_match_method"] = None
        s["jjm_block"] = None
        s["jjm_village"] = None
        s["_canon_district"] = canonical_district(s.get("district_raw") or s["district"])
        s["_norm_name"] = norm_name(s["name"])
        s["_norm_block"] = norm_block(s.get("block"))

    by_district_block: dict[tuple, list[dict]] = defaultdict(list)
    by_district: dict[str, list[dict]] = defaultdict(list)
    matched_already: set[int] = set()
    for s in schools:
        by_district[s["_canon_district"]].append(s)
        if s["_norm_block"]:
            by_district_block[(s["_canon_district"], s["_norm_block"])].append(s)

    block_matched = district_matched = unmatched = 0
    unmatched_examples = []
    from collections import Counter
    matched_by_category = Counter()
    total_by_category = Counter()

    for row in jjm:
        total_by_category[row["category"]] += 1
        district = row["district"]  # already canonicalized by build_jjm_schools.py
        target_norm = norm_name(row["name"])
        target_block = norm_block(row["block"])

        best, score = None, 0.0
        method = None
        if target_block:
            candidates = [c for c in by_district_block.get((district, target_block), []) if id(c) not in matched_already]
            b, s_score = best_match(target_norm, candidates)
            if b is not None and s_score >= BLOCK_THRESHOLD:
                best, score, method = b, s_score, "block_name_match"

        if best is None:
            candidates = [c for c in by_district.get(district, []) if id(c) not in matched_already]
            b, s_score = best_match(target_norm, candidates)
            if b is not None and s_score >= DISTRICT_THRESHOLD:
                best, score, method = b, s_score, "district_name_match"

        if best is None:
            unmatched += 1
            if len(unmatched_examples) < 10:
                unmatched_examples.append(f"{row['name']} ({district} / {row['block']})")
            continue

        matched_already.add(id(best))
        matched_by_category[row["category"]] += 1
        if method == "block_name_match":
            block_matched += 1
        else:
            district_matched += 1
        for f in JJM_FIELDS:
            best[f] = row[f]
        best["jjm_match_method"] = method
        best["jjm_block"] = row["block"]
        best["jjm_village"] = row["village"]

    total_matched = block_matched + district_matched
    print(f"\nJJM merge: {total_matched}/{len(jjm)} matched ({100*total_matched/len(jjm):.1f}%)")
    print(f"  block-scoped:    {block_matched}")
    print(f"  district-scoped: {district_matched}")
    print(f"  unmatched:       {unmatched}")
    print("\nSample unmatched (first 10):")
    for e in unmatched_examples:
        print(f"  {e}")
    print("\nMatch rate by JJM category:")
    for cat, tot in total_by_category.most_common():
        m = matched_by_category.get(cat, 0)
        print(f"  {cat:15s} {m:6d}/{tot:6d} ({100*m/tot:.1f}%)")

    for s in schools:
        del s["_canon_district"], s["_norm_name"], s["_norm_block"]

    OUT_SCHOOLS.write_text(json.dumps(schools, separators=(",", ":")))
    OUT_SUMMARY.write_text(json.dumps({
        "meta": {
            "note": "JJM tap-water/sanitation data merged onto the SHVR/CSR union registry by "
                    "NAME match (no UDISE code in the JJM export), scoped to (current district, "
                    f"block) at a {BLOCK_THRESHOLD} similarity threshold where both sides have a "
                    f"block, falling back to district-only matching at a stricter {DISTRICT_THRESHOLD} "
                    "threshold otherwise. jjm_match_method on each school records which tier applied.",
        },
        "jjm_total": len(jjm),
        "matched_total": total_matched,
        "block_scoped_matches": block_matched,
        "district_scoped_matches": district_matched,
        "unmatched": unmatched,
    }, indent=2))

    import os
    print(f"\nSaved {OUT_SCHOOLS} ({os.path.getsize(OUT_SCHOOLS)//1024}KB)")
    print(f"Saved {OUT_SUMMARY}")


if __name__ == "__main__":
    main()
