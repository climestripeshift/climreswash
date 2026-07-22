"""
Fetch school locations from OpenStreetMap (Overpass API), chunked per state
to stay polite to the shared public Overpass server and to make a national
run resumable. Cross-references UDISE+'s official per-state school totals
(public aggregate-stats endpoint, no auth) as a coverage-transparency metric
— OSM is volunteer-mapped and will always be a subset of the real number.

UDISE+ has NO free bulk API for individual school records (name/GPS/WASH
detail) — that requires either official data-sharing access or per-school
captcha-gated lookups. This script gets what's actually publicly available:
real school point locations from OSM, honestly labelled with how complete
that coverage is against the official UDISE+ total for that state.

Cache: data/raw/schools_osm/<state_slug>.json (one file per state, skipped
if already present — safe to re-run, only fetches missing states)
Output: client/public/data/schools_osm.geojson (point FeatureCollection)
        client/public/data/schools_osm_coverage.json (per-state OSM vs UDISE+ counts)

Run: python scripts/fetch_schools_osm.py [--states "Goa,Sikkim"] [--limit N]
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT        = Path(__file__).resolve().parent.parent
STATES_GEO  = ROOT / "client/public/data/india_states.geojson"
CACHE_DIR   = ROOT / "data/raw/schools_osm"
OUT_GEOJSON = ROOT / "client/public/data/schools_osm.geojson"
OUT_COVERAGE = ROOT / "client/public/data/schools_osm_coverage.json"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
UDISE_STATE_STATS_URL = "https://kys.udiseplus.gov.in/web-app/api/region-statistics/by-broad-cat-mgt"

# hex_props / india_states.geojson state name → UDISE 2-digit state code
# (from https://kys.udiseplus.gov.in/web-app/api/states?yearId=0)
UDISE_STATE_CODE = {
    "Andaman & Nicobar Island": "35", "Andhra Pradesh": "28", "Arunachal Pradesh": "12",
    "Assam": "18", "Bihar": "10", "Chandigarh": "04", "Chhattisgarh": "22",
    "Dadra & Nagar Haveli": "38", "Daman & Diu": "38", "Delhi": "07", "Goa": "30",
    "Gujarat": "24", "Haryana": "06", "Himachal Pradesh": "02", "Jammu & Kashmir": "01",
    "Jharkhand": "20", "Karnataka": "29", "Kerala": "32", "Ladakh": "37",
    "Lakshadweep": "31", "Madhya Pradesh": "23", "Maharashtra": "27", "Manipur": "14",
    "Meghalaya": "17", "Mizoram": "15", "Nagaland": "13", "Odisha": "21",
    "Puducherry": "34", "Punjab": "03", "Rajasthan": "08", "Sikkim": "11",
    "Tamil Nadu": "33", "Telangana": "36", "Tripura": "16", "Uttarakhand": "05",
    "Uttar Pradesh": "09", "West Bengal": "19",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def state_bbox(feature) -> tuple[float, float, float, float]:
    """(south, west, north, east) — Overpass bbox order."""
    lats, lons = [], []
    def walk(coords):
        if isinstance(coords[0], (int, float)):
            lons.append(coords[0]); lats.append(coords[1])
        else:
            for c in coords:
                walk(c)
    walk(feature["geometry"]["coordinates"])
    return (min(lats), min(lons), max(lats), max(lons))


def overpass_fetch(bbox: tuple[float, float, float, float], retries: int = 3) -> list[dict]:
    south, west, north, east = bbox
    query = f"""
    [out:json][timeout:240];
    (
      node["amenity"="school"]({south},{west},{north},{east});
    );
    out body;
    """
    encoded = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        OVERPASS_URL, data=encoded,
        headers={"User-Agent": "ClimResWASH/1.0 (climate-resilient-WASH-India-research)"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=260) as resp:
                data = json.loads(resp.read())
            return data.get("elements", [])
        except urllib.error.HTTPError as e:
            wait = 30 * (attempt + 1)
            print(f"    HTTP {e.code}, backing off {wait}s...")
            time.sleep(wait)
        except Exception as e:
            wait = 20 * (attempt + 1)
            print(f"    error ({e}), retrying in {wait}s...")
            time.sleep(wait)
    print("    giving up on this state after retries")
    return []


def fetch_udise_total(state_code: str) -> int | None:
    url = f"{UDISE_STATE_STATS_URL}?regionCd={state_code}&yearId=0"
    req = urllib.request.Request(url, headers={"User-Agent": "ClimResWASH/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        if data.get("status"):
            return data["data"]["totalSch"]
    except Exception as e:
        print(f"    UDISE+ total fetch failed: {e}")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--states", help="Comma-separated state names to fetch (default: all)")
    ap.add_argument("--limit", type=int, help="Stop after N states (for a quick pilot run)")
    args = ap.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loading {STATES_GEO}...")
    states_gj = json.loads(STATES_GEO.read_text())
    features = states_gj["features"]
    if args.states:
        wanted = {s.strip() for s in args.states.split(",")}
        features = [f for f in features if f["properties"]["state"] in wanted]
    if args.limit:
        features = features[: args.limit]
    print(f"  {len(features)} states to process")

    # Merge into whatever's already on disk — a --states-scoped run (e.g. a
    # retry of a few failed states) must not wipe out the other states' data.
    coverage: dict[str, dict] = {}
    all_features: list[dict] = []
    other_state_features: list[dict] = []
    if OUT_COVERAGE.exists():
        coverage = json.loads(OUT_COVERAGE.read_text())
    if OUT_GEOJSON.exists():
        existing = json.loads(OUT_GEOJSON.read_text())
        processing = {f["properties"]["state"] for f in features}
        other_state_features = [f for f in existing["features"] if f["properties"]["state"] not in processing]

    for i, feat in enumerate(features):
        state = feat["properties"]["state"]
        cache_path = CACHE_DIR / f"{slug(state)}.json"

        if cache_path.exists():
            print(f"[{i+1}/{len(features)}] {state}: cached")
            elements = json.loads(cache_path.read_text())
        else:
            print(f"[{i+1}/{len(features)}] {state}: fetching from Overpass...")
            bbox = state_bbox(feat)
            elements = overpass_fetch(bbox)
            cache_path.write_text(json.dumps(elements))
            print(f"    {len(elements)} school nodes — sleeping 5s (politeness)")
            time.sleep(5)

        for el in elements:
            tags = el.get("tags", {})
            all_features.append({
                "type": "Feature",
                "properties": {
                    "name": tags.get("name", ""),
                    "state": state,
                    "operator_type": tags.get("operator:type", tags.get("operator", "")),
                    "osm_id": el.get("id"),
                },
                "geometry": {"type": "Point", "coordinates": [el.get("lon"), el.get("lat")]},
            })

        udise_code = UDISE_STATE_CODE.get(state)
        udise_total = fetch_udise_total(udise_code) if udise_code else None
        osm_count = len(elements)
        coverage[state] = {
            "osm_schools": osm_count,
            "udise_official_total": udise_total,
            "coverage_pct": round(100 * osm_count / udise_total, 1) if udise_total else None,
        }
        cov_str = f"{coverage[state]['coverage_pct']}%" if coverage[state]["coverage_pct"] is not None else "n/a"
        print(f"    OSM: {osm_count}  UDISE+ official: {udise_total}  coverage: {cov_str}")

    print(f"\nSaving {OUT_GEOJSON}...")
    out_gj = {"type": "FeatureCollection", "features": other_state_features + all_features}
    OUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_GEOJSON, "w") as f:
        json.dump(out_gj, f, separators=(",", ":"))

    print(f"Saving {OUT_COVERAGE}...")
    with open(OUT_COVERAGE, "w") as f:
        json.dump(coverage, f, indent=2)

    import os
    print(f"\nDone. {len(out_gj['features'])} schools across {len(coverage)} states total "
          f"({len(all_features)} from this run).")
    print(f"  {OUT_GEOJSON.name}: {os.path.getsize(OUT_GEOJSON)//1024}KB")


if __name__ == "__main__":
    main()
