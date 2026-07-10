"""
Scrape SBM Phase 2 toilet-type data for every district in India.
Source: sbm.gov.in/sbmphase2/Secure/Report/SBM_GetToiletTypeDetails.aspx
No auth needed for national → state → district drill.

Output: client/public/data/sbm_toilet_types.json
  Keys: "STATE|DISTRICT" (uppercase, pipe-separated)
  Values: {state, district, lgd_dist_code, total_blocks, total_villages_mis,
           total_ihhl, villages_entry_started, toilet_type_entered,
           single_pit_pct, twin_pit_pct, septic_soak_pct,
           septic_nosoak_pct, others_pct, total_typology,
           source, date}

Run: python scripts/fetch_sbm_districts.py
"""

import json, re, time
from datetime import date
from pathlib import Path
from bs4 import BeautifulSoup
import requests

URL  = "https://sbm.gov.in/sbmphase2/Secure/Report/SBM_GetToiletTypeDetails.aspx"
OUT  = Path(__file__).resolve().parent.parent / "client/public/data/sbm_toilet_types.json"
TODAY = date.today().isoformat()


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0"})
    return s


def dedup_cookies(s: requests.Session):
    """Keep only the last value when duplicate cookie names exist."""
    seen: dict = {}
    for c in s.cookies:
        seen[c.name] = c
    s.cookies.clear()
    for c in seen.values():
        s.cookies.set(c.name, c.value, domain=c.domain)


def parse_payload(soup: BeautifulSoup) -> dict:
    return {
        i["name"]: i.get("value", "")
        for i in soup.find_all("input")
        if i.get("name") and i.get("type", "text").lower() not in ("submit", "button", "image")
    }


def safe_int(v: str) -> int:
    try:
        return int(v.replace(",", "").strip())
    except Exception:
        return 0


def safe_pct(num: int, denom: int) -> float | None:
    if denom <= 0:
        return None
    return round(num / denom * 100, 1)


def parse_district_table(soup: BeautifulSoup, state_name: str) -> list[dict]:
    """Parse the district-level table after a state PostBack."""
    table = soup.find("table", {"class": lambda c: c and "table-rpt-report" in str(c) if c else False})
    if not table:
        return []

    rows = table.find_all("tr")
    # Row 0 = colspan header (state name), rows 1-2 = col headers, row 3+ = data
    results = []
    for row in rows[3:]:
        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
        # Skip summary / back rows
        if not cells or not cells[0].replace(".", "").isdigit():
            continue
        if len(cells) < 10:
            continue

        # Column layout (0-indexed after S.No at col 0):
        # 0=SNO  1=DistName  2=LGDCode  3=Blocks  4=Villages  5=IHHL
        # 6=VillagesEntryStarted  7=ToiletTypeEntered  8=No.TotalTypology
        # Then toilet counts: 9=SinglePit  10=TwinPit  11=SepticSoak
        #                     12=SepticNoSoak  13=Others  14=TotalTypology  15=??
        try:
            dist_name  = cells[1].upper().strip()
            lgd_code   = cells[2].strip()
            total_blk  = safe_int(cells[3])
            total_vil  = safe_int(cells[4])
            total_ihhl = safe_int(cells[5])
            vil_entry  = safe_int(cells[6])
            tt_entered = safe_int(cells[7])
            n_typology = safe_int(cells[8]) if len(cells) > 8 else 0

            # Toilet type absolute counts (may or may not be present)
            s_pit  = safe_int(cells[9])  if len(cells) > 9  else 0
            tw_pit = safe_int(cells[10]) if len(cells) > 10 else 0
            sep_s  = safe_int(cells[11]) if len(cells) > 11 else 0
            sep_ns = safe_int(cells[12]) if len(cells) > 12 else 0
            others = safe_int(cells[13]) if len(cells) > 13 else 0
            total_t= safe_int(cells[14]) if len(cells) > 14 else (s_pit + tw_pit + sep_s + sep_ns + others)

            results.append({
                "state":                  state_name,
                "district":               dist_name,
                "lgd_dist_code":          lgd_code,
                "total_blocks":           total_blk,
                "total_villages_mis":     total_vil,
                "total_ihhl":             total_ihhl,
                "villages_entry_started": vil_entry,
                "toilet_type_entered":    tt_entered,
                "total_typology":         total_t,
                "single_pit":             s_pit,
                "twin_pit":               tw_pit,
                "septic_soak":            sep_s,
                "septic_nosoak":          sep_ns,
                "others":                 others,
                "single_pit_pct":         safe_pct(s_pit, total_t),
                "twin_pit_pct":           safe_pct(tw_pit, total_t),
                "septic_soak_pct":        safe_pct(sep_s, total_t),
                "septic_nosoak_pct":      safe_pct(sep_ns, total_t),
                "others_pct":             safe_pct(others, total_t),
                "source":                 "SBM Phase 2 IMIS",
                "date":                   TODAY,
            })
        except (IndexError, ValueError):
            continue

    return results


def get_state_name_from_response(soup: BeautifulSoup) -> str:
    """Extract actual state name from the 'State Name :- X' row in the table."""
    table = soup.find("table", {"class": lambda c: c and "table-rpt-report" in str(c) if c else False})
    if not table:
        return "Unknown"
    rows = table.find_all("tr")
    for row in rows:
        txt = row.get_text(strip=True)
        m = re.search(r"State Name\s*[:\-]+\s*(.+)", txt, re.IGNORECASE)
        if m:
            return m.group(1).strip().title()
    return "Unknown"


def scrape_all(skip: int = 0) -> dict:
    existing: dict = {}
    if OUT.exists():
        existing = json.loads(OUT.read_text())
        print(f"Loaded {len(existing)} existing district records")

    s = make_session()
    print("Loading national page...")
    r0 = s.get(URL, timeout=45)
    dedup_cookies(s)
    soup0 = BeautifulSoup(r0.text, "html.parser")
    payload = parse_payload(soup0)

    # Collect all state PostBack targets
    state_links = [
        (a.get_text(strip=True), re.search(r"'([^']+)'", a["href"]).group(1))
        for a in soup0.find_all("a", href=lambda h: h and "doPostBack" in h)
    ]
    print(f"Found {len(state_links)} state links (skipping first {skip})")
    state_links = state_links[skip:]

    all_data: dict = dict(existing)
    errors: list[str] = []

    for idx, (state_display, target) in enumerate(state_links):
        print(f"\n  [{idx+1}/{len(state_links)}] {state_display}...", end=" ", flush=True)

        try:
            # Always reload the national page before each state click so
            # VIEWSTATE is at the top level (not stuck at district drill)
            r0 = s.get(URL, timeout=45)
            dedup_cookies(s)
            soup0 = BeautifulSoup(r0.text, "html.parser")
            national_payload = parse_payload(soup0)

            post_payload = {**national_payload, "__EVENTTARGET": target, "__EVENTARGUMENT": ""}
            r1 = s.post(URL, data=post_payload, timeout=45, allow_redirects=False)

            if r1.status_code != 200:
                print(f"SKIP (status {r1.status_code})")
                errors.append(state_display)
                time.sleep(3)
                continue

            soup1 = BeautifulSoup(r1.text, "html.parser")
            actual_state = get_state_name_from_response(soup1)
            districts    = parse_district_table(soup1, actual_state)

            if not districts:
                print(f"0 districts")
                time.sleep(1)
                continue

            for d in districts:
                key = f"{d['state'].upper()}|{d['district'].upper()}"
                all_data[key] = d

            print(f"{len(districts)} districts ({actual_state})")
            time.sleep(4)

        except Exception as e:
            print(f"ERROR: {e}")
            errors.append(state_display)
            time.sleep(8)

    return all_data, errors


def main():
    import sys
    skip = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    print("SBM District Toilet Type Scraper")
    print("=" * 40)
    data, errors = scrape_all(skip=skip)

    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"\nSaved {len(data)} district records → {OUT}")
    if errors:
        print(f"Failed states ({len(errors)}): {errors}")

    # Print summary stats
    states = {v["state"] for v in data.values()}
    print(f"States covered: {len(states)}")
    total_ihhl = sum(v.get("total_ihhl", 0) for v in data.values())
    print(f"Total IHHL nationally: {total_ihhl:,}")


if __name__ == "__main__":
    main()
