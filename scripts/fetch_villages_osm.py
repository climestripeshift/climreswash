"""
Fetch village/hamlet/town point locations for all of India from OpenStreetMap
(Overpass API), chunked per state -- same pattern as fetch_schools_osm.py,
same tag filter already proven for Rajasthan (data/raw/rajasthan_villages/
osm_villages_raw.json, place=village|hamlet|town, used by
match_shvr_villages.py). This just runs that same query nationally.

OSM's village coverage is real but not exhaustive or uniform -- it's
volunteer-mapped, so it'll always be a subset of the ~6.4 lakh villages in
the Census 2011 village directory, better in some states than others. This
is the best free, already-geocoded national source available; a fully
authoritative dataset would need stitching together Census/LGD/SECC
sources that aren't published as a single clean geocoded file.

Cache: data/raw/villages_osm/<state_slug>.json (one file per state, skipped
if already present -- safe to re-run, only fetches missing states)
Output: data/raw/villages_osm_combined.geojson (point FeatureCollection,
        name/place-type/state per feature) -- a raw intermediate, NOT a
        public data file (134MB+ nationally, no reason to ship it to the
        frontend or commit it -- attach_villages_to_hexes.py is the only
        consumer, and its own output is what actually goes in public/data)

Run: python scripts/fetch_villages_osm.py [--states "Goa,Sikkim"] [--limit N]
"""
import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT        = Path(__file__).resolve().parent.parent
STATES_GEO  = ROOT / "client/public/data/india_states.geojson"
CACHE_DIR   = ROOT / "data/raw/villages_osm"
OUT_GEOJSON = ROOT / "data/raw/villages_osm_combined.geojson"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
PLACE_TYPES = ["village", "hamlet", "town"]


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def state_bbox(feature) -> tuple[float, float, float, float]:
    """(south, west, north, east) -- Overpass bbox order."""
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
    place_filter = "|".join(PLACE_TYPES)
    query = f"""
    [out:json][timeout:300];
    (
      node["place"~"^({place_filter})$"]({south},{west},{north},{east});
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
            with urllib.request.urlopen(req, timeout=320) as resp:
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

    all_features: list[dict] = []
    other_state_features: list[dict] = []
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
            print(f"    {len(elements)} place nodes -- sleeping 5s (politeness)")
            time.sleep(5)

        for el in elements:
            tags = el.get("tags", {})
            all_features.append({
                "type": "Feature",
                "properties": {
                    "name": tags.get("name", ""),
                    "place": tags.get("place", ""),
                    "state": state,
                    "population": tags.get("population"),
                    "osm_id": el.get("id"),
                },
                "geometry": {"type": "Point", "coordinates": [el.get("lon"), el.get("lat")]},
            })

        print(f"    running total: {len(other_state_features) + len(all_features)} villages across processed states")

    print(f"\nSaving {OUT_GEOJSON}...")
    out_gj = {"type": "FeatureCollection", "features": other_state_features + all_features}
    OUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_GEOJSON, "w") as f:
        json.dump(out_gj, f, separators=(",", ":"))

    import os
    print(f"\nDone. {len(out_gj['features'])} villages/hamlets/towns total.")
    print(f"  {OUT_GEOJSON.name}: {os.path.getsize(OUT_GEOJSON)//1024//1024}MB")


if __name__ == "__main__":
    main()
