"""
Build a unified JJM anganwadi (Balwadi/Anganwadi) tap-water dataset from
district-level exports of the same F26 report used for schools — same
export mechanism (login-gated JJM MIS portal, HTML table saved as .xls),
same column schema, just filtered to "Balwadi/Aganwadi" classification
rows instead of school grade-levels.

Source: ~/UNICEF RAJASTHAN/climreswash/JJM/anganwadi/*.xls

Co-location: the "Scheme Name" column is mostly water-supply project
names, but a large share of rows (~36% in a spot-check) say literally
"Owned and managed by School only" — i.e. this anganwadi's water
connection comes via a co-located school's own connection, not an
independent one. That's treated as a direct, textual co-location
signal (co_located_with_school), not an inferred/guessed one.

Same dedup key as build_jjm_schools.py (Block + Habitation LGD ID +
normalized name) — handles the one known duplicate file (ajmer.xls is
a strict subset of "Ajmer rural.xls", same class of leftover partial
download as bedla.xls was for schools) for free, no exclusion needed.

Run: python scripts/build_jjm_anganwadi.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

from join_shvr_infrastructure_needs import canonical_district

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path.home() / "UNICEF RAJASTHAN/climreswash/JJM/anganwadi"
OUT_FACILITIES = ROOT / "client/public/data/jjm_anganwadi_rajasthan.json"
OUT_DISTRICT = ROOT / "client/public/data/jjm_anganwadi_district_summary_rajasthan.json"

CO_LOCATED_SCHEME_TEXT = "OWNED AND MANAGED BY SCHOOL ONLY"

FILENAME_TO_DISTRICT = {
    "ajmer": "AJMER", "ajmer rural": "AJMER", "alwar": "ALWAR", "balotra": "BALOTRA",
    "banswara": "BANSWARA", "baran": "BARAN", "barmer": "BARMER", "beawar": "BEAWAR",
    "bhatapur": "BHARATPUR", "bharatpur": "BHARATPUR", "bhilwara": "BHILWARA",
    "bikaner": "BIKANER", "bundi": "BUNDI", "chittorgarh": "CHITTORGARH",
    "chittaurgarh": "CHITTORGARH", "churu": "CHURU", "dausa": "DAUSA", "deeg": "DEEG",
    "dholpur": "DHOLPUR", "didwan": "DIDWANA - KUCHAMAN", "didwana": "DIDWANA - KUCHAMAN",
    "dungarppur": "DUNGARPUR", "dungarpur": "DUNGARPUR", "ganganagar": "GANGANAGAR",
    "hanumangarh": "HANUMANGARH", "jaipur": "JAIPUR", "jaisalmer": "JAISALMER",
    "jalore": "JALORE", "jalor": "JALORE", "jhalawar": "JHALAWAR", "jhunjhunu": "JHUNJHUNU",
    "jodhpur": "JODHPUR", "karauli": "KARAULI", "khaithal": "KHAIRTHAL-TIJARA",
    "khairthal": "KHAIRTHAL-TIJARA", "kota": "KOTA", "kotputli": "KOTPUTLI-BEHROR",
    "nagaur": "NAGAUR", "pali": "PALI", "phalodi": "PHALODI", "pratapgarh": "PRATAPGARH",
    "rajsamand": "RAJSAMAND", "salumber": "SALUMBAR", "salumbar": "SALUMBAR",
    "sawai madhopur": "SAWAI MADHOPUR", "sikar": "SIKAR", "sirohi": "SIROHI",
    "tonk": "TONK", "udaipur": "UDAIPUR",
}

CATEGORY_MAP = {"Govt.": "Government", "Private": "Private", "Local Body": "Local Body"}


def norm_name(v: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", str(v or "").upper())


def norm_block(v: str) -> str:
    return re.sub(r"[^A-Z]", "", str(v or "").upper())


def yes(v) -> bool | None:
    v = str(v or "").strip().upper()
    if v == "YES":
        return True
    if v == "NO":
        return False
    return None


def parse_coord(v: str) -> float | None:
    if not v:
        return None
    try:
        return float(v.replace(",", "."))
    except ValueError:
        return None


def parse_file(f: Path) -> tuple[str | None, list[dict]]:
    from bs4 import BeautifulSoup

    stem = f.stem.strip().lower()
    if stem not in FILENAME_TO_DISTRICT:
        print(f"  WARNING: {f.name} -- no district mapping for filename stem {stem!r}, "
              f"guessing from the stem directly (add it to FILENAME_TO_DISTRICT if wrong)")
        district = canonical_district(stem.upper())
    else:
        district = canonical_district(FILENAME_TO_DISTRICT[stem])

    with open(f, encoding="utf-8", errors="ignore") as fh:
        html = fh.read()
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        print(f"  WARNING: {f.name} -- no table found, skipping")
        return district, []

    rows = tables[0].find_all("tr")
    out = []
    for r in rows[1:]:
        cells = [c.get_text(strip=True) for c in r.find_all(["td", "th"])]
        if len(cells) < 21 or not cells[8]:
            continue
        scheme_name = cells[21] if len(cells) > 21 and cells[21] not in ("", "---") else None
        out.append({
            "district": district,
            "block": cells[1] or None,
            "panchayat": cells[2] or None,
            "village": cells[4] or None,
            "habitation_lgd_id": cells[6] or None,
            "habitation": cells[7] or None,
            "name": cells[8],
            "category": CATEGORY_MAP.get(cells[9], cells[9] or None),
            "classification": cells[10] or None,
            "tap_water": yes(cells[11]),
            "toilet_running_water": yes(cells[12]),
            "hand_washing": yes(cells[13]),
            "separate_toilets_girls_boys": yes(cells[14]),
            "lat": parse_coord(cells[15]),
            "lon": parse_coord(cells[16]),
            "rainwater_harvesting": yes(cells[17]),
            "dried_toilets": yes(cells[18]),
            "grey_water_mgmt": yes(cells[19]),
            "approved_by_state": yes(cells[20]),
            "scheme_name": scheme_name,
            "co_located_with_school": scheme_name is not None and scheme_name.strip().upper() == CO_LOCATED_SCHEME_TEXT,
        })
    return district, out


def main():
    if not SRC_DIR.exists():
        print(f"Source folder not found: {SRC_DIR}")
        return

    files = sorted(f for f in SRC_DIR.iterdir()
                    if f.suffix.lower() in (".xls", ".xlsx") and not f.name.startswith("~$"))
    print(f"Found {len(files)} files in {SRC_DIR}")

    seen: dict[tuple, dict] = {}
    by_district_files: dict[str, int] = defaultdict(int)
    for f in files:
        district, rows = parse_file(f)
        added = 0
        for row in rows:
            key = (row["block"], row["habitation_lgd_id"], norm_name(row["name"]))
            if key not in seen:
                seen[key] = row
                added += 1
        by_district_files[district] += 1
        print(f"  {f.name:30s} -> {district:20s} {len(rows):5d} rows ({added} new)")

    anganwadis = list(seen.values())
    print(f"\nUnified JJM anganwadi registry: {len(anganwadis)} facilities across {len(by_district_files)} districts")

    co_located_total = sum(1 for a in anganwadis if a["co_located_with_school"])
    print(f"\nCo-located with a school (Scheme Name = \"{CO_LOCATED_SCHEME_TEXT.title()}\"): "
          f"{co_located_total}/{len(anganwadis)} ({100*co_located_total/len(anganwadis):.1f}%)")

    by_district: dict[str, dict] = {}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for a in anganwadis:
        grouped[a["district"]].append(a)

    amenity_fields = ["tap_water", "toilet_running_water", "hand_washing",
                       "separate_toilets_girls_boys", "rainwater_harvesting",
                       "dried_toilets", "grey_water_mgmt"]
    for d, group in sorted(grouped.items()):
        n = len(group)
        co_located = sum(1 for a in group if a["co_located_with_school"])
        by_district[d] = {
            "total_facilities": n,
            "co_located_with_school_count": co_located,
            "co_located_with_school_pct": round(100 * co_located / n, 1) if n else None,
            "govt_count": sum(1 for a in group if a["category"] == "Government"),
            "private_count": sum(1 for a in group if a["category"] == "Private"),
            "local_body_count": sum(1 for a in group if a["category"] == "Local Body"),
            "has_coordinates": sum(1 for a in group if a["lat"] is not None),
        }
        for field in amenity_fields:
            yes_c = sum(1 for a in group if a[field] is True)
            by_district[d][f"{field}_count"] = yes_c
            by_district[d][f"{field}_pct"] = round(100 * yes_c / n, 1) if n else None

    print("\nTap water + co-location status by district:")
    for d, v in sorted(by_district.items(), key=lambda kv: -kv[1]["total_facilities"]):
        print(f"  {d:18s} n={v['total_facilities']:5d}  tap_water={v['tap_water_pct']:>5}%  "
              f"co_located={v['co_located_with_school_pct']:>5}% ({v['co_located_with_school_count']})")

    OUT_FACILITIES.write_text(json.dumps(anganwadis, separators=(",", ":")))
    OUT_DISTRICT.write_text(json.dumps({
        "meta": {
            "source": "JJM F26 report, Balwadi/Anganwadi rows, manually exported per-district "
                      "from the login-gated JJM MIS portal",
            "note": "No UDISE/AWC code in this export -- identified only by Block/Panchayat/"
                    "Village/Habitation (LGD codes), same as the schools JJM dataset. "
                    "co_located_with_school is read directly from the Scheme Name column "
                    f'("{CO_LOCATED_SCHEME_TEXT.title()}") -- a real textual signal from the '
                    "source data, not an inferred/geographic proxy.",
            "districts_covered": sorted(by_district.keys()),
            "co_located_total": co_located_total,
            "co_located_pct": round(100 * co_located_total / len(anganwadis), 1) if anganwadis else None,
        },
        "by_district": by_district,
    }, indent=2))

    import os
    print(f"\nSaved {OUT_FACILITIES} ({os.path.getsize(OUT_FACILITIES)//1024}KB)")
    print(f"Saved {OUT_DISTRICT}")


if __name__ == "__main__":
    main()
