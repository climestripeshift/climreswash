"""
Match SHVR school addresses to real coordinates via a village/town name
gazetteer, instead of raw geocoding (which only resolved ~3.5% of these
addresses — too messy/terse for a general geocoder).

Approach: OSM has place=village/hamlet/town nodes with real names and
coordinates (data/raw/rajasthan_villages/osm_villages_raw.json, ~35,700
for Rajasthan). Each village is assigned to a district via the hex grid
(same district_name already used for the coarser district-centroid
fallback). Each SHVR school's address is then matched — as a whole-word,
not substring, to avoid "PALI" matching inside "PALIWAL" — against ONLY
that school's own district's villages, picking the longest (most
specific) match. This local matching has no rate limit and covers all
39,602 schools in seconds, unlike live geocoding.

Where a village match is found, the school gets that village's real
coordinates (and the hex actually containing it) instead of the district
centroid — a real precision upgrade for however many resolve. Where no
match is found, the existing district-centroid fallback is kept, and
each school is honestly labeled with which one applies.

Run: python scripts/match_shvr_villages.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

import h3

ROOT          = Path(__file__).resolve().parent.parent
VILLAGES_RAW  = ROOT / "data/raw/rajasthan_villages/osm_villages_raw.json"
HEX_PROPS     = ROOT / "client/public/data/india_hex_props.json"
SCHOOLS       = ROOT / "client/public/data/shvr_schools_rajasthan.json"
OUT_SCHOOLS   = ROOT / "client/public/data/shvr_schools_located_rajasthan.json"

H3_RES = 5

# Rajasthani/Hindi place-name suffixes that are near-universal ("X Ki Dhani",
# "X Nagar", "X Ka Bas", "X Pura", "X Garh") — when an OSM node's name is
# JUST the bare suffix with no prefix, matching it is unreliable: hundreds of
# differently-located real places sharing that generic word would all
# collapse onto whichever single node happens to be named exactly that.
GENERIC_TERMS = {"DHANI", "NAGAR", "BAS", "PURA", "GARH"}


def normalize(s: str) -> str:
    s = re.sub(r"[^A-Za-z\s]", " ", s.upper())
    return re.sub(r"\s+", " ", s).strip()


def main():
    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    h3_to_district = {p["h3_id"]: p["district_name"] for p in props if p.get("state") == "Rajasthan" and p.get("district_name")}
    print(f"  {len(h3_to_district)} Rajasthan hexes")

    print(f"Loading {VILLAGES_RAW}...")
    villages_raw = json.loads(VILLAGES_RAW.read_text())["elements"]
    print(f"  {len(villages_raw)} OSM place nodes")

    # ── Assign each village to a district via its hex, build per-district gazetteer ──
    gazetteer: dict[str, list[dict]] = defaultdict(list)
    for v in villages_raw:
        name = v.get("tags", {}).get("name")
        lat, lon = v.get("lat"), v.get("lon")
        if not name or lat is None or lon is None:
            continue
        h3_id = h3.latlng_to_cell(lat, lon, H3_RES)
        district = h3_to_district.get(h3_id)
        if not district:
            continue  # outside Rajasthan's hex grid (border noise)
        norm = normalize(name)
        if len(norm) < 3:
            continue  # too short to match reliably (e.g. stray single letters)
        if norm == normalize(district):
            continue  # district HQ towns often share the district's name — matching to
            # it is no more precise than the district-centroid fallback it's meant to beat,
            # and (being long) it can shadow a genuinely more specific village match that
            # also appears in the same address (e.g. "VILL-RAMADI ... DISTT-JHALAWAR").
        if norm in GENERIC_TERMS:
            continue
        gazetteer[district].append({"name": name, "norm": norm, "lat": lat, "lon": lon})

    print(f"  {sum(len(v) for v in gazetteer.values())} villages assigned to {len(gazetteer)} districts")
    # Sort each district's list longest-name-first so the first substring hit found is the most specific
    for d in gazetteer:
        gazetteer[d].sort(key=lambda v: -len(v["norm"]))

    print(f"\nLoading {SCHOOLS}...")
    schools = json.loads(SCHOOLS.read_text())
    print(f"  {len(schools)} schools")

    matched = 0
    out = []
    for s in schools:
        district = s["district"]
        addr_norm = normalize(s.get("address") or "")
        village_list = gazetteer.get(district, [])

        match = None
        if addr_norm:
            for v in village_list:
                # whole-word match: village name bounded by non-letters (or string edges)
                if re.search(rf"(?<![A-Z]){re.escape(v['norm'])}(?![A-Z])", addr_norm):
                    match = v
                    break

        if match:
            matched += 1
            h3_id = h3.latlng_to_cell(match["lat"], match["lon"], H3_RES)
            out.append({**s, "lat": match["lat"], "lon": match["lon"], "h3_id": h3_id,
                        "matched_village": match["name"], "location_precision": "village_match"})
        else:
            out.append({**s, "lat": None, "lon": None, "h3_id": None,
                        "matched_village": None, "location_precision": "district_centroid"})

    print(f"\nMatched: {matched}/{len(schools)} ({100*matched/len(schools):.1f}%)")

    by_district_rate: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for s in out:
        d = s["district"]
        by_district_rate[d][1] += 1
        if s["location_precision"] == "village_match":
            by_district_rate[d][0] += 1
    print("\nMatch rate by district:")
    for d, (hit, total) in sorted(by_district_rate.items(), key=lambda kv: -kv[1][0] / kv[1][1]):
        print(f"  {d:16s} {hit:5d}/{total:5d}  ({100*hit/total:.1f}%)")

    OUT_SCHOOLS.write_text(json.dumps(out, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT_SCHOOLS} ({os.path.getsize(OUT_SCHOOLS)//1024}KB)")


if __name__ == "__main__":
    main()
