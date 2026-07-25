"""
Build a unified JJM (Jal Jeevan Mission) school/institution tap-water
dataset from district-level exports of the F26 report ("Status of Pipe
Water Supply in School/Balwadi/Anganwadi").

Source: ~/UNICEF RAJASTHAN/climreswash/JJM/*.xls — one file per district,
manually exported by the user from the (login-gated) JJM MIS portal. Files
are actually HTML tables saved with an .xls extension (a standard ASP.NET
GridView "export to Excel" quirk), not real binary Excel — parsed with
BeautifulSoup, not openpyxl.

No UDISE code in this export at all — facilities are identified only by
Block/Panchayat/Village/Habitation (LGD codes) + facility name. That means
this CANNOT be reliably joined onto the SHVR/CSR union registry by code,
the way the CSR toilet file was (name-matching within an LGD hierarchy
this different from UDISE would be a much weaker signal) — so this stays
a separate, independent dataset for now: real per-facility tap-water/
sanitation status, keyed by its own geography, not linked to a school's
SHVR rating or UDISE code.

District is NOT a column in the file — inferred from the filename via
FILENAME_TO_DISTRICT below (filenames are informal, sometimes typo'd,
e.g. "dungapyr.xls" -> Dungarpur). Unrecognized filenames fall back to
title-casing the stem and print a warning so a new alias can be added.

Coverage grows as more district files are added to the folder — this
script always reflects whatever's currently there, safe to re-run.

Run: python scripts/build_jjm_schools.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

from bs4 import BeautifulSoup

from join_shvr_infrastructure_needs import canonical_district

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path.home() / "UNICEF RAJASTHAN/climreswash/JJM"
OUT_SCHOOLS = ROOT / "client/public/data/jjm_schools_rajasthan.json"
OUT_DISTRICT = ROOT / "client/public/data/jjm_district_summary_rajasthan.json"

# filename stem (lowercased, spaces preserved) -> raw district name (fed through
# canonical_district() same as every other source in this pipeline)
FILENAME_TO_DISTRICT = {
    "ajmer": "AJMER", "alwar": "ALWAR", "balotra": "BALOTRA", "banswara": "BANSWARA",
    "baran": "BARAN", "barmer": "BARMER", "beawar": "BEAWAR", "bharatpur": "BHARATPUR",
    "bhilwara": "BHILWARA", "bikaner": "BIKANER", "bundi": "BUNDI",
    "chittorgarh": "CHITTORGARH", "chittaurgarh": "CHITTORGARH", "churu": "CHURU",
    "dausa": "DAUSA", "deeg": "DEEG",
    "dholpur": "DHOLPUR", "didwana": "DIDWANA - KUCHAMAN", "dungapyr": "DUNGARPUR",
    "dungarpur": "DUNGARPUR", "ganganagar": "GANGANAGAR", "hanuman": "HANUMANGARH",
    "hanumangarh": "HANUMANGARH", "jaipur": "JAIPUR", "jaisalmer": "JAISALMER",
    "jalore": "JALORE", "jalor": "JALORE", "jhalawar": "JHALAWAR", "jhunjhunu": "JHUNJHUNU",
    "jodhpur": "JODHPUR", "karauli": "KARAULI", "khairthal": "KHAIRTHAL-TIJARA",
    "khairthal-tijara": "KHAIRTHAL-TIJARA",
    "kota": "KOTA", "kotputli": "KOTPUTLI-BEHROR", "kotputli-behror": "KOTPUTLI-BEHROR",
    "nagaur": "NAGAUR", "pali": "PALI",
    "phalodi": "PHALODI", "pratapgarh": "PRATAPGARH", "rajsamand": "RAJSAMAND",
    "salumbar": "SALUMBAR", "salumber": "SALUMBAR", "sawai madhopur": "SAWAI MADHOPUR",
    "sikar": "SIKAR", "sirohi": "SIROHI", "tonk": "TONK", "udaipur": "UDAIPUR",
    # not real district files -- old block-level sample exports, superseded once the
    # real district file exists (e.g. bedla.xls's Bargaon block is inside udaipur.xls)
    "bedla": None, "amberi": None, "1bedla": None, "badgoan": None,
}

CATEGORY_MAP = {"Govt.": "Government", "Private": "Private", "Local Body": "Local Body"}


def norm_name(v: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", str(v or "").upper())


def yes(v) -> bool | None:
    v = str(v or "").strip().upper()
    if v == "YES":
        return True
    if v == "NO":
        return False
    return None


def parse_coord(v: str) -> float | None:
    """Coordinates occasionally use a comma decimal separator (e.g. "73,4312000")
    instead of a point -- a locale quirk in how some district offices exported."""
    if not v:
        return None
    try:
        return float(v.replace(",", "."))
    except ValueError:
        return None


def parse_file(f: Path) -> tuple[str | None, list[dict]]:
    stem = f.stem.strip().lower()
    if stem not in FILENAME_TO_DISTRICT:
        print(f"  WARNING: {f.name} -- no district mapping for filename stem {stem!r}, "
              f"guessing from the stem directly (add it to FILENAME_TO_DISTRICT if wrong)")
        district = canonical_district(stem.upper())
    else:
        raw = FILENAME_TO_DISTRICT[stem]
        if raw is None:
            return None, []
        district = canonical_district(raw)

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
        out.append({
            "district": district,
            "block": cells[1] or None,
            "panchayat": cells[2] or None,
            "village_lgd_id": cells[5] or None,
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
            "scheme_name": cells[21] if len(cells) > 21 and cells[21] not in ("", "---") else None,
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
        if district is None:
            print(f"  {f.name}: skipped (superseded block-level sample)")
            continue
        added = 0
        for row in rows:
            # dedup key: block + habitation LGD code + normalized facility name -- the
            # closest thing to a stable identity this export offers without a UDISE code
            key = (row["block"], row["habitation_lgd_id"], norm_name(row["name"]))
            if key not in seen:
                seen[key] = row
                added += 1
        by_district_files[district] += 1
        print(f"  {f.name:30s} -> {district:20s} {len(rows):5d} rows ({added} new)")

    schools = list(seen.values())
    print(f"\nUnified JJM registry: {len(schools)} facilities across {len(by_district_files)} districts")

    by_district: dict[str, dict] = {}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for s in schools:
        grouped[s["district"]].append(s)

    for d, group in sorted(grouped.items()):
        n = len(group)
        tap_yes = sum(1 for s in group if s["tap_water"] is True)
        tap_no = sum(1 for s in group if s["tap_water"] is False)
        by_district[d] = {
            "total_facilities": n,
            "tap_water_yes": tap_yes,
            "tap_water_no": tap_no,
            "tap_water_pct": round(100 * tap_yes / n, 1) if n else None,
            "govt_count": sum(1 for s in group if s["category"] == "Government"),
            "private_count": sum(1 for s in group if s["category"] == "Private"),
            "local_body_count": sum(1 for s in group if s["category"] == "Local Body"),
            "has_coordinates": sum(1 for s in group if s["lat"] is not None),
        }

    print(f"\nTap water status by district:")
    for d, v in sorted(by_district.items(), key=lambda kv: -kv[1]["total_facilities"]):
        print(f"  {d:18s} n={v['total_facilities']:5d}  tap_water={v['tap_water_pct']:>5}%  "
              f"({v['tap_water_yes']}/{v['total_facilities']})  geo-tagged={v['has_coordinates']}")

    OUT_SCHOOLS.write_text(json.dumps(schools, separators=(",", ":")))
    OUT_DISTRICT.write_text(json.dumps({
        "meta": {
            "source": "JJM F26 report (Status of Pipe Water Supply in School/Balwadi/Anganwadi), "
                      "manually exported per-district from the login-gated JJM MIS portal",
            "note": "No UDISE code in this export -- not linked to the SHVR/CSR union registry, "
                    "a standalone facility-level dataset keyed by Block/Panchayat/Village/Habitation "
                    "(LGD codes). Coverage grows as more district files are added to "
                    "~/UNICEF RAJASTHAN/climreswash/JJM/ -- re-run this script to pick up new ones.",
            "districts_covered": sorted(by_district.keys()),
        },
        "by_district": by_district,
    }, indent=2))

    import os
    print(f"\nSaved {OUT_SCHOOLS} ({os.path.getsize(OUT_SCHOOLS)//1024}KB)")
    print(f"Saved {OUT_DISTRICT}")


if __name__ == "__main__":
    main()
