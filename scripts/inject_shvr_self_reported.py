"""
Inject SHVR's self-reported assessment data onto the unified school registry
— a separate, richer export than the district-by-district files already
integrated (compute_shvr_ratings.py's "ratings view" + "directory view").

Source: ~/UNICEF RAJASTHAN/climreswash/SHVR data.xlsx — 50,887 rows, ALL 41
current districts, a self-assessment rating + percentage for every single
row (no "unrated" schools here, unlike the directory-view districts), plus
richer fields (Block, Location Rural/Urban, Management, Residential) not
present in the earlier exports. UDISE codes are clean (zero duplicates).

Why inject rather than replace: the existing `rating`/`percentage`/`status`
fields come from SHVR's STATE-VERIFIED evaluation view (a district officer
signs off) — a more authoritative signal where it exists, but only 26 of 33
old districts have a real verified rating (the other 7's files are
directory-only exports with no rating column at all). Self-reported data
covers every district, so this fills that gap as a clearly separate,
labeled field rather than silently overwriting the verified one.

50,852 of this file's 50,887 schools are already in the registry (matched
by UDISE code) — their self_reported_* fields get filled in, and in_shvr
gets upgraded to true if a school was previously CSR-only. The remaining 35
are genuinely new and get appended, same pattern as CSR-only schools.

Run: python scripts/inject_shvr_self_reported.py
"""
import json
import re
from pathlib import Path

from join_shvr_infrastructure_needs import NEW_TO_OLD_DISTRICT, canonical_district, norm_code

ROOT = Path(__file__).resolve().parent.parent
SRC = Path.home() / "UNICEF RAJASTHAN/climreswash/SHVR data.xlsx"
SCHOOLS = OUT_SCHOOLS = ROOT / "client/public/data/shvr_schools_infra_rajasthan.json"


def parse_rating(v) -> int | None:
    if not v:
        return None
    m = re.match(r"(\d+)", str(v).strip())
    return int(m.group(1)) if m else None


def main():
    import openpyxl

    if not SRC.exists():
        print(f"Source file not found: {SRC}")
        return

    print(f"Loading {SRC}...")
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["Sheet1"]

    self_reported: dict[str, dict] = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[4]:
            continue
        code = norm_code(row[5]) if row[5] else None
        if not code:
            continue
        district = canonical_district(row[2])
        self_reported[code] = {
            "name": row[4],
            "district_raw": district,
            "district": NEW_TO_OLD_DISTRICT.get(district, district),
            "block": row[3] or None,
            "address": row[6] or None,
            "self_reported_percentage": float(row[7]) if row[7] not in (None, "") else None,
            "self_reported_rating": parse_rating(row[8]),
            "school_type": row[9] or None,
            "location_rural_urban": row[10] or None,
            "management": row[11] or None,
            "residential": row[13] or None,
        }
    print(f"  {len(self_reported)} self-reported school records parsed")

    print(f"\nLoading {SCHOOLS}...")
    schools = json.loads(SCHOOLS.read_text())
    print(f"  {len(schools)} schools already on file")

    existing_codes = {norm_code(s["udise_code"]) for s in schools if s.get("udise_code")}

    matched = upgraded = 0
    for s in schools:
        s["block"] = None
        s["self_reported_rating"] = None
        s["self_reported_percentage"] = None
        s["location_rural_urban"] = None
        s["management"] = None
        s["residential"] = None

        code = norm_code(s["udise_code"]) if s.get("udise_code") else None
        if code and code in self_reported:
            matched += 1
            sr = self_reported[code]
            s["block"] = sr["block"]
            s["self_reported_rating"] = sr["self_reported_rating"]
            s["self_reported_percentage"] = sr["self_reported_percentage"]
            s["location_rural_urban"] = sr["location_rural_urban"]
            s["management"] = sr["management"]
            s["residential"] = sr["residential"]
            if not s["in_shvr"]:
                upgraded += 1
                s["in_shvr"] = True
                if s["status"] == "not_in_shvr":
                    s["status"] = "self_reported_only"

    print(f"Matched self-reported data onto {matched} existing schools "
          f"({upgraded} upgraded from CSR-only to in_shvr=true)")

    # ── Add self-reported-only schools not already in the registry ──────────
    new_codes = set(self_reported) - existing_codes
    print(f"{len(new_codes)} self-reported schools are new — adding them")
    for code in sorted(new_codes):
        sr = self_reported[code]
        schools.append({
            "name": sr["name"], "udise_code": code, "address": sr["address"],
            "school_type": sr["school_type"], "nep_category": None,
            "district_raw": sr["district_raw"], "district": sr["district"],
            "status": "self_reported_only", "rating": None, "percentage": None,
            "lat": None, "lon": None, "h3_id": None,
            "matched_village": None, "location_precision": "district_centroid",
            "in_shvr": True, "school_level": None,
            "new_classroom_requirement": False, "classroom_repair_needed": False,
            "building_dilapidated": False, "dilapidated_classroom_count": 0,
            "classrooms_needing_repair": 0, "girls_toilet_required": None,
            "toilet_match_method": None,
            "block": sr["block"], "self_reported_rating": sr["self_reported_rating"],
            "self_reported_percentage": sr["self_reported_percentage"],
            "location_rural_urban": sr["location_rural_urban"], "management": sr["management"],
            "residential": sr["residential"],
        })

    print(f"Unified registry now: {len(schools)} schools")

    OUT_SCHOOLS.write_text(json.dumps(schools, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT_SCHOOLS} ({os.path.getsize(OUT_SCHOOLS)//1024}KB)")


if __name__ == "__main__":
    main()
