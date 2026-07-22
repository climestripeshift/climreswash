"""
Fetch current (post-2023-split) Rajasthan district boundary polygons via
Nominatim, one district at a time — the bulk "all admin boundaries in
Rajasthan" Overpass query kept timing out, but per-district lookups are
fast and well within Nominatim's usage policy (1 req/sec, ~35 requests).

Only fetches the 32 districts SHVR actually has data for (extracted from
shvr_schools_infra_rajasthan.json's district_raw field) — the 7 old
districts with zero SHVR data (Dungarpur, Ganganagar, Hanumangarh,
Jhunjhunun, Karauli, Rajsamand, Sawai Madhopur) keep their old/undivided
boundary from india.json rather than guessing at how they may or may not
have been further split, since there's no data to show differently
either way.

Output: client/public/data/rajasthan_districts_current.geojson
  properties: NAME (current district name), OLD_DISTRICT (the pre-2023
  parent, for joining against hex-grid data which still uses old
  boundaries), IS_CURRENT (true for Nominatim-fetched, false for the
  7 kept-as-old districts)

Run: python scripts/fetch_rajasthan_district_boundaries.py
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOOLS = ROOT / "client/public/data/shvr_schools_infra_rajasthan.json"
INDIA_DISTRICTS = ROOT / "client/public/data/india.json"
OUT_FILE = ROOT / "client/public/data/rajasthan_districts_current.geojson"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ClimResWASH/1.0 (climate-resilient-WASH research platform; contact adityajain321@gmail.com)"

# current district (as it appears in SHVR) -> old/undivided parent (as used by the hex grid)
NEW_TO_OLD_DISTRICT = {
    "BALOTARA": "Barmer", "BEAWAR": "Ajmer", "DEEG": "Bharatpur",
    "DIDWANA-KUCHAMAN": "Nagaur", "KHAIRTHAL-TIJARA": "Alwar",
    "KOTPUTLI-BEHROR": "Jaipur", "PHALODI": "Jodhpur", "PRATAPGARH (RAJ.)": "Pratapgarh",
}
# districts with zero SHVR data — keep their old/undivided boundary as-is
NO_DATA_OLD_DISTRICTS = ["Dungarpur", "Ganganagar", "Hanumangarh", "Jhunjhunun", "Karauli", "Rajsamand", "Sawai Madhopur"]

# districts with zero SHVR data, but whose OLD boundary would visibly overlap a split-off
# sibling that IS covered (e.g. old undivided Jodhpur would overlap the Phalodi polygon
# above) — these need their real CURRENT boundary fetched too, just with no stats to show.
# Salumbar has no SHVR rating data either, but the CSR infra files DO cover it (carved out
# of old Udaipur), so it needs a real current boundary too, not Udaipur's old one.
NO_DATA_CURRENT_DISTRICTS = [("Jodhpur", "Jodhpur"), ("Salumbar", "Udaipur")]


def query_name(raw: str) -> str:
    return raw.replace("(RAJ.)", "").strip().title()


# SHVR's spelling didn't resolve to a proper boundary polygon on Nominatim (came back as a
# bare Point instead — likely matched a town/landmark of a similar name) — these are the
# standard English spellings, which do resolve correctly.
NOMINATIM_SPELLING_ALIAS = {
    "Chittaurgarh": "Chittorgarh",
    "Jalor": "Jalore",
    "Balotara": "Balotra",
}


def fetch_polygon(name: str) -> dict | None:
    params = {"q": f"{name} District, Rajasthan, India", "format": "json", "polygon_geojson": 1, "limit": 1}
    url = f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            results = json.loads(resp.read())
        if not results:
            return None
        return results[0]["geojson"]
    except Exception as e:
        print(f"    error fetching {name}: {e}")
        return None


def main():
    print(f"Loading {SCHOOLS}...")
    schools = json.loads(SCHOOLS.read_text())
    raw_names = sorted({s["district_raw"] for s in schools if s.get("district_raw")})
    print(f"  {len(raw_names)} current district names to fetch")

    features = []
    for i, raw in enumerate(raw_names):
        name = query_name(raw)
        query_as = NOMINATIM_SPELLING_ALIAS.get(name, name)
        old = NEW_TO_OLD_DISTRICT.get(raw, name)
        print(f"[{i+1}/{len(raw_names)}] {name}" + (f" (querying as {query_as})" if query_as != name else "") + f" (old: {old})...")
        geom = fetch_polygon(query_as)
        if geom and geom["type"] not in ("Polygon", "MultiPolygon"):
            print(f"    got {geom['type']} instead of a boundary polygon — treating as no match")
            geom = None
        if geom:
            features.append({
                # NAME stays the SHVR spelling (query_as was only for Nominatim lookup) so it
                # keeps matching district_raw-derived stats computed elsewhere from SHVR data.
                "type": "Feature",
                "properties": {"NAME": name, "OLD_DISTRICT": old, "IS_CURRENT": True},
                "geometry": geom,
            })
        else:
            print(f"    NO MATCH for {name}")
        time.sleep(1.1)

    print(f"\nFetched {len(features)}/{len(raw_names)} current district polygons")

    print(f"Fetching {len(NO_DATA_CURRENT_DISTRICTS)} no-SHVR-rating districts that still need their current boundary...")
    for name, old in NO_DATA_CURRENT_DISTRICTS:
        geom = fetch_polygon(name)
        if geom and geom["type"] not in ("Polygon", "MultiPolygon"):
            geom = None
        if geom:
            features.append({"type": "Feature", "properties": {"NAME": name, "OLD_DISTRICT": old, "IS_CURRENT": True}, "geometry": geom})
            print(f"    {name}: ok")
        else:
            print(f"    NO MATCH for {name}")
        time.sleep(1.1)

    # Keep the 7 no-data districts at their old/undivided boundary
    print(f"Loading {INDIA_DISTRICTS} for the {len(NO_DATA_OLD_DISTRICTS)} no-data districts...")
    india = json.loads(INDIA_DISTRICTS.read_text())
    old_by_name = {f["properties"]["NAME"]: f for f in india["features"] if f["properties"].get("STATE") == "Rajasthan"}
    for d in NO_DATA_OLD_DISTRICTS:
        f = old_by_name.get(d)
        if f:
            features.append({
                "type": "Feature",
                "properties": {"NAME": d, "OLD_DISTRICT": d, "IS_CURRENT": False},
                "geometry": f["geometry"],
            })
        else:
            print(f"    WARNING: {d} not found in india.json either")

    out = {"type": "FeatureCollection", "features": features}
    OUT_FILE.write_text(json.dumps(out, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT_FILE} ({os.path.getsize(OUT_FILE)//1024}KB, {len(features)} districts)")


if __name__ == "__main__":
    main()
