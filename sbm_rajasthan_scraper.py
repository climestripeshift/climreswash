"""
Rajasthan SBM Phase 2 toilet type scraper — block level.
Strategy: State → District → Excel export (one shot per district)
Output:
  sbm_rajasthan_districts.csv  — 41 district rows
  sbm_rajasthan_blocks.csv     — all blocks across all districts
Source: https://sbm.gov.in/sbmphase2/Secure/Report/SBM_GetToiletTypeDetails.aspx
"""

import requests
import csv
import time
import sys
from bs4 import BeautifulSoup

URL = "https://sbm.gov.in/sbmphase2/Secure/Report/SBM_GetToiletTypeDetails.aspx"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
DELAY = 1.3

DIST_COLS = [
    "state", "district", "lgd_code", "total_blocks", "total_villages_mis",
    "total_ihhl", "villages_entry_started",
    "toilet_single_pit", "toilet_twin_pit",
    "toilet_septic_with_soak", "toilet_septic_without_soak",
    "toilet_others", "toilet_total", "verification_certificates",
]
BLOCK_COLS = ["state", "district"] + DIST_COLS[2:]  # same shape, district replaced by block


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_full_form(html: str) -> tuple[dict, BeautifulSoup]:
    soup = BeautifulSoup(html, "html.parser")
    payload: dict[str, str] = {}
    radio_groups: dict[str, str | None] = {}
    for inp in soup.find_all("input"):
        name = inp.get("name")
        if not name:
            continue
        typ = inp.get("type", "text").lower()
        if typ == "radio":
            if inp.get("checked"):
                radio_groups[name] = inp.get("value", "")
            elif name not in radio_groups:
                radio_groups[name] = None
        elif typ in ("submit", "image", "button"):
            pass
        elif typ != "checkbox":
            payload[name] = inp.get("value", "")
        else:
            if inp.get("checked"):
                payload[name] = inp.get("value", "on")
    for name, val in radio_groups.items():
        if val is not None:
            payload[name] = val
    return payload, soup


def do_post(session: requests.Session, payload: dict, target: str, extra: dict | None = None) -> requests.Response:
    data = {**payload, "__EVENTTARGET": target, "__EVENTARGUMENT": ""}
    if extra:
        data.update(extra)
    r = session.post(URL, data=data, timeout=40)
    r.raise_for_status()
    return r


def excel_post(session: requests.Session, payload: dict) -> bytes:
    data = {**payload, "__EVENTTARGET": "", "__EVENTARGUMENT": "",
            "ctl00$ContentPlaceHolder1$btnExcel": "Excel"}
    r = session.post(URL, data=data, timeout=60)
    r.raise_for_status()
    return r.content


def parse_data_rows(html_bytes: bytes) -> list[list[str]]:
    """Extract numeric data rows from table[2], skipping sub-headers."""
    soup = BeautifulSoup(html_bytes, "html.parser")
    tables = soup.find_all("table")
    if len(tables) < 3:
        return []
    rows = []
    for tr in tables[2].find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        # real data: cells[0] = "N." (digit + dot), cells[1] = name (not digit)
        if (cells
                and cells[0].rstrip(".").isdigit()
                and len(cells) > 2
                and not cells[1].replace(" ", "").isdigit()):
            rows.append(cells[1:])  # drop S.No, keep the rest
    return rows


def get_district_targets(soup: BeautifulSoup) -> list[tuple[str, str]]:
    """District drill-down links from Rajasthan-level page."""
    tables = soup.find_all("table")
    if len(tables) < 3:
        return []
    links = []
    for a in tables[2].find_all("a", href=True):
        href = a["href"]
        if "__doPostBack" in href and "lnk_DistrictName" in href:
            links.append((a.get_text(strip=True), href.split("'")[1]))
    return links


def retry_get(session: requests.Session, url: str, max_tries: int = 3) -> requests.Response:
    for attempt in range(max_tries):
        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            return r
        except Exception as e:
            if attempt == max_tries - 1:
                raise
            print(f"    Retry {attempt+1}/{max_tries}: {e}")
            time.sleep(5)


def retry_post(session, payload, target, max_tries=3, extra=None):
    for attempt in range(max_tries):
        try:
            return do_post(session, payload, target, extra)
        except Exception as e:
            if attempt == max_tries - 1:
                raise
            print(f"    Retry {attempt+1}/{max_tries}: {e}")
            time.sleep(5)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    session = requests.Session()
    session.headers.update(HEADERS)

    RAJ_TARGET = "ctl00$ContentPlaceHolder1$Rpt_State$ctl27$lkn_statename"

    # ── Step 1: initial GET ───────────────────────────────────────────────────
    print("Step 1: Fetching initial page …")
    r = retry_get(session, URL)
    base0, _ = parse_full_form(r.text)

    # ── Step 2: drill Rajasthan, get district list ────────────────────────────
    print("Step 2: Drilling into Rajasthan …")
    r = retry_post(session, base0, RAJ_TARGET)
    raj_payload, raj_soup = parse_full_form(r.text)
    time.sleep(DELAY)

    # District-level Excel export (save as reference)
    print("  Excel export (district level) …")
    dist_html = excel_post(session, raj_payload)
    with open("sbm_rajasthan_export.html", "wb") as f:
        f.write(dist_html)
    district_rows = parse_data_rows(dist_html)
    print(f"  Districts: {len(district_rows)}")
    with open("sbm_rajasthan_districts.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(DIST_COLS)
        for row in district_rows:
            w.writerow(["Rajasthan"] + row[:13])
    time.sleep(DELAY)

    # Re-drill Rajasthan to get fresh payload with district links
    r = retry_post(session, base0, RAJ_TARGET)
    raj_payload, raj_soup = parse_full_form(r.text)
    time.sleep(DELAY)

    district_targets = get_district_targets(raj_soup)
    print(f"  District drill-down links: {len(district_targets)}")

    # ── Step 3: for each district, drill in + Excel export ────────────────────
    all_block_rows = []

    for i, (dist_name, dist_target) in enumerate(district_targets, 1):
        print(f"  [{i:02d}/{len(district_targets)}] {dist_name} …", end=" ", flush=True)
        try:
            r = retry_post(session, raj_payload, dist_target)
            dist_payload, _ = parse_full_form(r.text)
            time.sleep(DELAY)

            block_html = excel_post(session, dist_payload)
            block_rows = parse_data_rows(block_html)
            print(f"{len(block_rows)} blocks")

            for row in block_rows:
                all_block_rows.append(["Rajasthan", dist_name] + row[:12])

            time.sleep(DELAY)

            # Return to Rajasthan level for next district
            r = retry_post(session, base0, RAJ_TARGET)
            raj_payload, raj_soup = parse_full_form(r.text)
            time.sleep(DELAY)

        except Exception as e:
            print(f"ERROR: {e}")
            # Try to recover Rajasthan level before continuing
            try:
                r = retry_get(session, URL)
                base0, _ = parse_full_form(r.text)
                r = retry_post(session, base0, RAJ_TARGET)
                raj_payload, raj_soup = parse_full_form(r.text)
                time.sleep(DELAY * 2)
            except Exception as e2:
                print(f"    Recovery failed: {e2} — skipping")

    # ── Step 4: write block CSV ───────────────────────────────────────────────
    out = "sbm_rajasthan_blocks.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(BLOCK_COLS)
        w.writerows(all_block_rows)

    print(f"\nDone. {len(all_block_rows)} block rows → {out}")
    print(f"      {len(district_rows)} district rows → sbm_rajasthan_districts.csv")


if __name__ == "__main__":
    main()
