"""
Extract the full NFHS-5 district fact-sheet — all ~105 indicators across
19 categories — into a per-district JSON for the Report page.

Source: data/nfhs5_district_all_indicators.csv (long format: one row per
district × indicator, 700 districts). Keyed onto the same district_name
strings used in india_hex_props.json (fuzzy-matched, same approach as
integrate_nfhs5.py) so ReportPage.tsx can look it up directly by district.

Run: python scripts/compute_nfhs5_full_profile.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
NFHS_CSV  = ROOT / "data/nfhs5_district_all_indicators.csv"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT_JSON  = ROOT / "client/public/data/nfhs5_full_profile.json"


def normalize(name: str) -> str:
    n = (name.lower().strip()
         .replace(" & ", " and ")
         .replace("&", " and ")
         .replace("-", " ")
         .replace("(", " ").replace(")", " "))
    return " ".join(n.split())


# Districts renamed, retyped, or split between the hex grid's district source
# and this NFHS-5 fact-sheet file. Left-hand side is the hex_props district
# name (normalized); right-hand side is what to look up in the raw file
# instead. Districts NOT here that still fail to match are genuinely absent
# from NFHS-5 (2019-21 fieldwork) — mostly districts carved out afterward.
DISTRICT_ALIASES: dict[tuple[str, str], str] = {
    ("gujarat", "ahmadabad"): "ahmedabad",
    ("gujarat", "batod"): "botad",
    ("gujarat", "dohad"): "dahod",
    ("maharashtra", "ahmadnagar"): "ahmednagar",
    ("uttar pradesh", "allahabad"): "prayagraj",
    ("uttar pradesh", "samli"): "shamli",
    ("west bengal", "darjiling"): "darjeeling",
    ("uttarakhand", "garhwal"): "pauri garhwal",
    ("uttarakhand", "hardwar"): "haridwar",
    ("chhattisgarh", "dakshin bastar dantewada"): "dantewada",
    ("chhattisgarh", "gariaband"): "gariyaband",
    ("chhattisgarh", "kondagaon"): "kodagaon",
    ("telangana", "hydrabad"): "hyderabad",
    ("telangana", "jagtial"): "jagitial",
    ("telangana", "jangaon"): "jangoan",
    ("andhra pradesh", "kadapa ysr"): "y.s.r.",
    ("ladakh", "leh ladakh"): "leh ladakh",
    ("punjab", "gurdaspur"): "gurudaspur",
    ("tripura", "sipahijula"): "sepahijala",
    ("tripura", "unokoti"): "unakoti",
}


def main():
    print(f"Loading {NFHS_CSV}...")
    # Group raw rows by normalized (state, district) → {category: [indicators]}
    raw_by_key: dict[tuple[str, str], dict] = {}
    with open(NFHS_CSV, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            state = row["State"].strip()
            district = row["District"].strip()
            key = (normalize(state), normalize(district))
            entry = raw_by_key.setdefault(key, {"state": state, "district": district, "categories": defaultdict(list)})
            try:
                nfhs5 = float(row["NFHS 5"].strip().replace(",", ""))
            except ValueError:
                continue
            nfhs4_raw = row.get("NFHS 4", "").strip().replace(",", "")
            try:
                nfhs4 = float(nfhs4_raw)
            except ValueError:
                nfhs4 = None
            entry["categories"][row["Category"].strip()].append({
                "indicator": row["Indicator"].strip(),
                "nfhs5": nfhs5,
                "nfhs4": nfhs4,
            })
    print(f"  {len(raw_by_key)} raw districts, "
          f"{sum(len(v['categories'][c]) for v in raw_by_key.values() for c in v['categories'])} indicator values")

    print(f"Loading {HEX_PROPS}...")
    props = json.load(HEX_PROPS.open())
    hex_districts = sorted({
        (p["district_name"], p.get("state", ""))
        for p in props
        if p.get("district_name") and p["district_name"] != "Unknown"
    })
    print(f"  {len(hex_districts)} hex districts")

    result: dict[str, dict] = {}
    matched = 0
    unmatched: list[str] = []

    for district, state in hex_districts:
        nd, ns = normalize(district), normalize(state)
        entry = raw_by_key.get((ns, nd))

        if entry is None and (ns, nd) in DISTRICT_ALIASES:
            entry = raw_by_key.get((ns, DISTRICT_ALIASES[(ns, nd)]))

        if entry is None:
            # Prefix match within the same state
            for (rs, rd), cand in raw_by_key.items():
                if rs == ns and (rd.startswith(nd[:5]) or nd.startswith(rd[:5])):
                    entry = cand
                    break
        if entry is None:
            # Last resort: district name match regardless of state (state naming drifts)
            for (rs, rd), cand in raw_by_key.items():
                if rd == nd:
                    entry = cand
                    break

        if entry is None:
            unmatched.append(f"{district}, {state}")
            continue

        matched += 1
        result[district] = {
            "state": state,
            "source_district": entry["district"],
            "categories": {cat: vals for cat, vals in entry["categories"].items()},
        }

    print(f"\n  Matched:   {matched}/{len(hex_districts)} districts")
    print(f"  Unmatched: {len(unmatched)}")
    for d in unmatched[:15]:
        print(f"    - {d}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    import os
    print(f"\nSaved {OUT_JSON} ({os.path.getsize(OUT_JSON)//1024} KB)")


if __name__ == "__main__":
    main()
