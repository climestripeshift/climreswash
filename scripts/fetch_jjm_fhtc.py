"""
Fetch district-level FHTC (Functional Household Tap Connection) data
from JJM IMIS J1 report (ejalshakti.gov.in).

Output: client/public/data/jjm_district_fhtc.json
  Keys: DISTRICT_NAME (uppercase)
  Values: { state, district, total_hh, hh_with_tap, fhtc_pct, source, date }

Usage:
  python scripts/fetch_jjm_fhtc.py
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from datetime import date
from pathlib import Path

URL = "https://ejalshakti.gov.in/JJM/JJMReports/Physical/Rpt_JJM_VillageWisePWSReport.aspx"
OUT = Path(__file__).parent.parent / "client/public/data/jjm_district_fhtc.json"

STATE_IDS = {
    "1": "Andaman & Nicobar Islands", "2": "Andhra Pradesh", "3": "Arunachal Pradesh",
    "4": "Assam", "5": "Bihar", "33": "Chhattisgarh",
    "7": "Dadra & Nagar Haveli And Daman & Diu", "10": "Goa", "11": "Gujarat",
    "12": "Haryana", "13": "Himachal Pradesh", "14": "Jammu & Kashmir",
    "34": "Jharkhand", "15": "Karnataka", "16": "Kerala", "37": "Ladakh",
    "19": "Lakshadweep", "17": "Madhya Pradesh", "18": "Maharashtra",
    "20": "Manipur", "21": "Meghalaya", "22": "Mizoram", "23": "Nagaland",
    "24": "Odisha", "25": "Puducherry", "26": "Punjab", "27": "Rajasthan",
    "28": "Sikkim", "29": "Tamil Nadu", "36": "Telangana", "30": "Tripura",
    "31": "Uttar Pradesh", "35": "Uttarakhand", "32": "West Bengal",
}


def parse_form(soup):
    payload = {}
    for inp in soup.find_all("input"):
        n = inp.get("name", "")
        t = inp.get("type", "text").lower()
        if n and t not in ("submit", "button", "image"):
            payload[n] = inp.get("value", "")
    for sel in soup.find_all("select"):
        n = sel.get("name", "")
        if n:
            sel_opt = sel.find("option", selected=True) or sel.find("option")
            payload[n] = sel_opt.get("value", "") if sel_opt else ""
    return payload


def get_districts(session, state_id, state_name, base, today):
    payload = {
        **base,
        "ctl00$CPHPage$ddState": state_id,
        "ctl00$CPHPage$ddFinyear": "-1",
        "ctl00$CPHPage$ddCategory": "1",
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "ctl00$CPHPage$btnShow": "Show",
    }
    r = session.post(URL, data=payload, timeout=90)
    soup = BeautifulSoup(r.text, "html.parser")
    table = soup.find("table", id="tableReportTable")
    if not table:
        return {}

    result = {}
    for row in table.find_all("tr")[3:]:
        cells = [td.get_text(strip=True).replace(",", "") for td in row.find_all(["td", "th"])]
        if len(cells) < 9 or not cells[0].isdigit():
            continue
        district = cells[1]
        try:
            total_hh = int(cells[7]) if cells[7] else 0
            hh_tap = int(cells[8]) if cells[8] else 0
            fhtc_pct = round(hh_tap / total_hh * 100, 1) if total_hh > 0 else 0.0
        except (ValueError, ZeroDivisionError):
            continue
        result[district.upper()] = {
            "state": state_name,
            "district": district,
            "total_hh": total_hh,
            "hh_with_tap": hh_tap,
            "fhtc_pct": fhtc_pct,
            "source": "JJM IMIS J1",
            "date": today,
        }
    return result


def main():
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    today = date.today().isoformat()

    print(f"Fetching initial form...")
    r0 = session.get(URL, timeout=30)
    base = parse_form(BeautifulSoup(r0.text, "html.parser"))

    all_data = {}
    errors = []

    for state_id, state_name in STATE_IDS.items():
        print(f"  {state_name}...", end=" ", flush=True)
        try:
            dists = get_districts(session, state_id, state_name, base, today)
            if dists:
                all_data.update(dists)
                print(f"{len(dists)} districts")
            else:
                print("0 (UT?)")
            time.sleep(0.8)
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append(state_name)
            time.sleep(3.0)

    OUT.write_text(json.dumps(all_data, indent=2))
    print(f"\nWrote {len(all_data)} districts → {OUT}")
    if errors:
        print(f"Failed states: {errors}")


if __name__ == "__main__":
    main()
