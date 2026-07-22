"""
Join UNICEF Rajasthan CSR infrastructure-needs lists (new classroom
requirement, classroom repair, dilapidated buildings, toilet requirement)
onto the SHVR school ratings, so we can see how infrastructure gaps break
down by star rating.

Source files: ~/UNICEF RAJASTHAN/2026/wins/CSR/fwd_/*.xlsx (not committed —
personal UNICEF working files, outside the repo)

Three of the four files join reliably by UDISE code. One (toilet
requirement) has a broken export where every row shares the same UDISE
code, so it's matched by school name instead, scoped to district (same
approach as the village-matching fix) with a confidence threshold —
lower-trust than a UDISE join and flagged as such per-row.

Data-integrity guard: even in the "reliable" files, a UDISE code that maps
to genuinely different school names (a smaller instance of the same
export bug) is dropped from the join rather than trusted — a rare
mislabeled row is worse than a missing one.

Run: python scripts/join_shvr_infrastructure_needs.py
"""
import difflib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC  = Path.home() / "UNICEF RAJASTHAN/2026/wins/CSR/fwd_"
# Reads its own prior output as input — safe/idempotent, since this script only ever
# overwrites the infra_* keys it itself adds, never touching the location/rating fields
# carried through from the original village-matching step.
SCHOOLS = ROOT / "client/public/data/shvr_schools_infra_rajasthan.json"

OUT_SCHOOLS = ROOT / "client/public/data/shvr_schools_infra_rajasthan.json"
OUT_SUMMARY = ROOT / "client/public/data/shvr_infra_by_rating_rajasthan.json"
OUT_DISTRICT_ABSOLUTE = ROOT / "client/public/data/shvr_district_absolute_infra_rajasthan.json"

NAME_MATCH_THRESHOLD = 0.82


def norm_code(v) -> str:
    return str(v).strip().zfill(11)


def norm_name(v: str) -> str:
    v = re.sub(r"[^A-Za-z0-9]", "", str(v or "").upper())
    return v


def yes(v) -> bool:
    return str(v or "").strip().upper() == "YES"


# CSR district-column spelling variants -> canonical name (matches rajasthan_districts_current.geojson)
DISTRICT_ALIAS = {
    "BALOTRA": "Balotara", "CHITTORGARH": "Chittaurgarh", "JALORE": "Jalor",
    "DHOLPUR": "Dhaulpur", "SRI GANGANAGAR": "Ganganagar", "JHUNJHUNU": "Jhunjhunun",
    "KOTPUTLI- BEHROR": "Kotputli-Behror", "KOTPUTLY/BEHROD": "Kotputli-Behror",
    "DIDWANA - KUCHAMAN": "Didwana-Kuchaman", "SALUMBER": "Salumbar",
}


def canonical_district(raw: str) -> str:
    up = (raw or "").strip().upper()
    return DISTRICT_ALIAS.get(up, up.title())


def clean_udise_map(rows: list[tuple[str, str, str, dict]]) -> tuple[dict[str, dict], "Counter[str]"]:
    """rows: (udise_code, school_name, district_raw, data) — drops codes whose rows disagree on
    school name. Returns the clean UDISE->data map plus a per-district count of clean entries
    (this is the absolute count, independent of whether the school is also in the SHVR ratings)."""
    by_code: dict[str, list[tuple[str, str, dict]]] = defaultdict(list)
    for code, name, district, data in rows:
        by_code[code].append((name, district, data))

    clean: dict[str, dict] = {}
    district_counts: Counter = Counter()
    dropped = 0
    for code, entries in by_code.items():
        names = {norm_name(n) for n, _, _ in entries}
        if len(names) > 1:
            dropped += 1
            continue
        # merge all rows for this (legitimately single) school: bools OR together,
        # numbers sum (e.g. two repair line-items' classroom counts really do add up)
        merged: dict = {}
        for _, _, data in entries:
            for k, v in data.items():
                if isinstance(v, bool):
                    merged[k] = merged.get(k, False) or v
                elif isinstance(v, (int, float)) and k in merged:
                    merged[k] += v
                else:
                    merged[k] = v
        clean[code] = merged
        district_counts[canonical_district(entries[0][1])] += 1
    print(f"    {len(by_code)} distinct codes -> {len(clean)} clean, {dropped} dropped (name mismatch)")
    return clean, district_counts


def load_acr_new() -> tuple[dict[str, dict], "Counter[str]"]:
    print("Loading ACR_New_Requirement_List.xlsx (new classroom / dilapidated building)...")
    wb = openpyxl.load_workbook(SRC / "ACR_New_Requirement_List.xlsx", data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        if row[5] is None:
            continue
        code = norm_code(row[5])
        name = row[4]
        rows.append((code, name, row[1], {
            "building_fully_dilapidated": yes(row[8]),
            "dilapidated_declared_official": yes(row[9]),
            "dilapidated_classroom_count": row[10] if isinstance(row[10], (int, float)) else 0,
            "new_classroom_requirement": True,
        }))
    return clean_udise_map(rows)


def load_acr_repair() -> tuple[dict[str, dict], "Counter[str]"]:
    print("Loading ACR_Raiparing List.xlsx (classroom repair)...")
    wb = openpyxl.load_workbook(SRC / "ACR_Raiparing List.xlsx", data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        if row[5] is None:
            continue
        code = norm_code(row[5])
        name = row[4]
        rows.append((code, name, row[1], {
            "classrooms_needing_repair": row[8] if isinstance(row[8], (int, float)) else 0,
            "repair_amount_needed_lakh": row[9] if isinstance(row[9], (int, float)) else 0,
            "classroom_repair_needed": True,
        }))
    return clean_udise_map(rows)


def load_dilapidated() -> tuple[dict[str, dict], "Counter[str]"]:
    print("Loading Dilapited_Building.xlsx...")
    wb = openpyxl.load_workbook(SRC / "Dilapited_Building.xlsx", data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        if row[4] is None:
            continue
        code = norm_code(row[4])
        name = row[3]
        rows.append((code, name, row[1], {"building_dilapidated_listed": yes(row[6])}))
    return clean_udise_map(rows)


def load_toilet_by_name() -> tuple[list[dict], int, "Counter[str]"]:
    """UDISE codes are broken (all identical) — match by normalized name within district for
    per-school attribution, but the District column itself is fine, so a straight per-district
    row count (no name-matching needed) gives the absolute count directly."""
    print("Loading Toilet_Requirement_List.xlsx (UDISE broken, matching by name)...")
    wb = openpyxl.load_workbook(SRC / "Toilet_Requirement_List.xlsx", data_only=True)
    ws = wb.active
    rows = []
    district_counts: Counter = Counter()
    for row in ws.iter_rows(min_row=3, values_only=True):
        if row[4] is None:
            continue
        rows.append({"district_raw": row[1], "school_name": row[4], "girls_toilet_required": row[6] or 1})
        district_counts[canonical_district(row[1])] += 1
    print(f"    {len(rows)} toilet-requirement rows (name-matched, UDISE ignored)")
    return rows, len(rows), district_counts


def main():
    if not SRC.exists():
        print(f"Source folder not found: {SRC}")
        return

    acr_new, acr_new_district_counts = load_acr_new()
    acr_repair, acr_repair_district_counts = load_acr_repair()
    dilapidated, dilapidated_district_counts = load_dilapidated()
    toilet_rows, toilet_total, toilet_district_counts = load_toilet_by_name()

    print(f"\nLoading {SCHOOLS}...")
    schools = json.loads(SCHOOLS.read_text())
    print(f"  {len(schools)} SHVR schools")

    # ── UDISE-based joins ────────────────────────────────────────────────────
    matched_new = matched_repair = matched_dilap = 0
    for s in schools:
        code = norm_code(s["udise_code"]) if s.get("udise_code") else None
        s["new_classroom_requirement"] = False
        s["classroom_repair_needed"] = False
        s["building_dilapidated"] = False
        s["dilapidated_classroom_count"] = 0
        s["classrooms_needing_repair"] = 0
        s["girls_toilet_required"] = None  # filled below, name-matched
        s["toilet_match_method"] = None

        if code and code in acr_new:
            matched_new += 1
            d = acr_new[code]
            s["new_classroom_requirement"] = True
            s["dilapidated_classroom_count"] = d["dilapidated_classroom_count"]
            if d["building_fully_dilapidated"]:
                s["building_dilapidated"] = True
        if code and code in acr_repair:
            matched_repair += 1
            d = acr_repair[code]
            s["classroom_repair_needed"] = True
            s["classrooms_needing_repair"] = d["classrooms_needing_repair"]
        if code and code in dilapidated:
            matched_dilap += 1
            s["building_dilapidated"] = True

    print(f"\nUDISE-joined: new_classroom={matched_new} repair={matched_repair} dilapidated={matched_dilap}")

    # ── Name-based join for toilet requirement (district-scoped) ───────────────
    by_district_schools: dict[str, list[dict]] = defaultdict(list)
    for s in schools:
        by_district_schools[s["district"]].append(s)

    # crude district-name normalize to match the CSR file's district spellings to hex districts
    def norm_district(d: str) -> str:
        return re.sub(r"[^A-Z]", "", (d or "").upper())

    hex_district_by_norm = {norm_district(d): d for d in by_district_schools}

    toilet_matched = 0
    for row in toilet_rows:
        hd = hex_district_by_norm.get(norm_district(row["district_raw"]))
        if not hd:
            continue
        target_norm = norm_name(row["school_name"])
        candidates = by_district_schools[hd]
        best, best_score = None, 0.0
        for s in candidates:
            score = difflib.SequenceMatcher(None, target_norm, norm_name(s["name"])).ratio()
            if score > best_score:
                best, best_score = s, score
        if best is not None and best_score >= NAME_MATCH_THRESHOLD and best["girls_toilet_required"] is None:
            best["girls_toilet_required"] = row["girls_toilet_required"]
            best["toilet_match_method"] = "name_match"
            toilet_matched += 1

    print(f"Toilet requirement matched by name: {toilet_matched}/{toilet_total} "
          f"({100*toilet_matched/toilet_total:.1f}%, threshold={NAME_MATCH_THRESHOLD})")

    # ── Summary by star rating ──────────────────────────────────────────────
    by_rating: dict[str, dict] = {}
    for r in [1, 2, 3, 4, 5, None]:
        key = str(r) if r is not None else "unrated"
        group = [s for s in schools if s["rating"] == r]
        n = len(group)
        by_rating[key] = {
            "school_count": n,
            "toilet_required_count": sum(1 for s in group if s["girls_toilet_required"]),
            "classroom_repair_needed_count": sum(1 for s in group if s["classroom_repair_needed"]),
            "new_classroom_requirement_count": sum(1 for s in group if s["new_classroom_requirement"]),
            "building_dilapidated_count": sum(1 for s in group if s["building_dilapidated"]),
        }
        if n:
            by_rating[key]["toilet_required_pct"] = round(100 * by_rating[key]["toilet_required_count"] / n, 1)
            by_rating[key]["classroom_repair_pct"] = round(100 * by_rating[key]["classroom_repair_needed_count"] / n, 1)
            by_rating[key]["new_classroom_pct"] = round(100 * by_rating[key]["new_classroom_requirement_count"] / n, 1)
            by_rating[key]["dilapidated_pct"] = round(100 * by_rating[key]["building_dilapidated_count"] / n, 1)

    print("\nInfrastructure needs by SHVR rating:")
    for k, v in by_rating.items():
        print(f"  {k:8s} n={v['school_count']:6d}  toilet={v.get('toilet_required_pct','-'):>5}%  "
              f"repair={v.get('classroom_repair_pct','-'):>5}%  new_room={v.get('new_classroom_pct','-'):>5}%  "
              f"dilapidated={v.get('dilapidated_pct','-'):>5}%")

    # ── Summary by district ──────────────────────────────────────────────────
    by_district: dict[str, dict] = {}
    for d, group in by_district_schools.items():
        n = len(group)
        rated = [s["rating"] for s in group if s["rating"] is not None]
        by_district[d] = {
            "school_count": n,
            "avg_rating": round(sum(rated) / len(rated), 2) if rated else None,
            "toilet_required_count": sum(1 for s in group if s["girls_toilet_required"]),
            "classroom_repair_needed_count": sum(1 for s in group if s["classroom_repair_needed"]),
            "new_classroom_requirement_count": sum(1 for s in group if s["new_classroom_requirement"]),
            "building_dilapidated_count": sum(1 for s in group if s["building_dilapidated"]),
        }
        if n:
            by_district[d]["toilet_required_pct"] = round(100 * by_district[d]["toilet_required_count"] / n, 1)
            by_district[d]["classroom_repair_pct"] = round(100 * by_district[d]["classroom_repair_needed_count"] / n, 1)
            by_district[d]["new_classroom_pct"] = round(100 * by_district[d]["new_classroom_requirement_count"] / n, 1)
            by_district[d]["dilapidated_pct"] = round(100 * by_district[d]["building_dilapidated_count"] / n, 1)

    print("\nInfrastructure needs by district:")
    for d, v in sorted(by_district.items(), key=lambda kv: -kv[1]["classroom_repair_pct"]):
        print(f"  {d:16s} n={v['school_count']:6d}  repair={v['classroom_repair_pct']:>5}%  "
              f"new_room={v['new_classroom_pct']:>5}%  dilapidated={v['dilapidated_pct']:>5}%")

    # ── District ABSOLUTE counts — direct from the 4 CSR files, independent of SHVR coverage.
    # These lists are each already a filtered subset ("schools needing X"), so there's no
    # natural "total schools" denominator to compute a percentage against — but the counts
    # themselves are real and cover districts SHVR never rated a single school in (Dungarpur,
    # Rajsamand, Karauli, Sawai Madhopur, Ganganagar, Hanumangarh, Jhunjhunun, Salumbar).
    all_districts = set(acr_new_district_counts) | set(acr_repair_district_counts) | \
        set(dilapidated_district_counts) | set(toilet_district_counts)
    # districts with real SHVR rating coverage, at CURRENT (not old-parent) granularity —
    # avg_rating itself is computed client-side from district_raw, since by_district above is
    # keyed by the coarser old-parent name and would misattribute e.g. Balotara's rating to Barmer.
    shvr_covered_current = {canonical_district(s["district_raw"]) for s in schools if s.get("district_raw")}

    district_absolute: dict[str, dict] = {}
    for d in sorted(all_districts):
        district_absolute[d] = {
            "new_classroom_requirement_count": acr_new_district_counts.get(d, 0),
            "classroom_repair_needed_count": acr_repair_district_counts.get(d, 0),
            "building_dilapidated_count": dilapidated_district_counts.get(d, 0),
            "toilet_required_count": toilet_district_counts.get(d, 0),
            "has_shvr_rating": d in shvr_covered_current,
        }

    print(f"\nDistrict absolute counts ({len(district_absolute)} districts, direct from CSR files):")
    for d, v in sorted(district_absolute.items(), key=lambda kv: -kv[1]["classroom_repair_needed_count"]):
        rated = "✓" if v["has_shvr_rating"] else "✗ (no SHVR rating)"
        print(f"  {d:18s} repair={v['classroom_repair_needed_count']:5d}  new_room={v['new_classroom_requirement_count']:5d}  "
              f"dilapidated={v['building_dilapidated_count']:4d}  toilet={v['toilet_required_count']:4d}  SHVR:{rated}")

    OUT_SCHOOLS.write_text(json.dumps(schools, separators=(",", ":")))
    OUT_SUMMARY.write_text(json.dumps({
        "meta": {
            "sources": ["ACR_New_Requirement_List.xlsx", "ACR_Raiparing List.xlsx",
                        "Dilapited_Building.xlsx", "Toilet_Requirement_List.xlsx"],
            "note": "First 3 files joined by UDISE code, dropping any code whose rows disagree on "
                    "school name (export-quality guard). Toilet_Requirement_List's UDISE column was "
                    "found completely broken (every row identical) and is instead matched by "
                    "normalized school name within district, threshold "
                    f"{NAME_MATCH_THRESHOLD} — lower confidence than the UDISE-joined fields, "
                    "flagged per-school via toilet_match_method.",
        },
        "by_rating": by_rating,
        "by_district": by_district,
    }, indent=2))

    OUT_DISTRICT_ABSOLUTE.write_text(json.dumps({
        "meta": {
            "note": "Absolute counts direct from the 4 CSR requirement lists, by CURRENT "
                    "(post-2023-split) district — NOT limited to SHVR-rated schools. Each source "
                    "file is already a filtered 'schools needing X' list, so there's no total-schools "
                    "denominator to compute a percentage against here; these are raw counts, "
                    "including for districts SHVR never rated a single school in.",
        },
        "by_district": district_absolute,
    }, indent=2))

    import os
    print(f"\nSaved {OUT_SCHOOLS} ({os.path.getsize(OUT_SCHOOLS)//1024}KB)")
    print(f"Saved {OUT_DISTRICT_ABSOLUTE}")
    print(f"Saved {OUT_SUMMARY}")


if __name__ == "__main__":
    main()
