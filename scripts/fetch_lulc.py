"""
Fetch real LULC 250K land-use from Bhuvan (ISRO) for all H3 hex centroids.
Uses year 2018_19 (most recent available). Updates land_use in india_hex_grid.geojson.

Run: python scripts/fetch_lulc.py --token YOUR_BHUVAN_TOKEN
"""
import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT     = Path(__file__).resolve().parent.parent
HEX_FILE = ROOT / "client/public/data/india_hex_grid.geojson"
API_URL  = "https://bhuvan-app1.nrsc.gov.in/api/lulc250k/curl_lulc250k_point.php"
YEAR     = "2018_19"
WORKERS  = 5


def map_lulc(desc: str) -> str:
    """Map Bhuvan LULC description to our simplified land-use class."""
    d = desc.strip().lower()
    if "mangrove" in d:
        return "mangrove"
    if "forest" in d or "plantation" in d:
        return "tree"
    if "crop" in d or "agricultur" in d or "fallow" in d or "shifting" in d:
        return "crop"
    if "built" in d or "urban" in d or "rural" in d or "mining" in d or "industrial" in d:
        return "built"
    if "water" in d or "river" in d or "lake" in d or "reservoir" in d or "tank" in d or "pond" in d:
        return "water"
    if "wetland" in d or "marsh" in d or "swamp" in d:
        return "wetland"
    if "scrub" in d or "shrub" in d:
        return "shrub"
    if "grass" in d or "grazing" in d or "pasture" in d:
        return "grass"
    if "snow" in d or "ice" in d or "glacial" in d:
        return "snow"
    if "barren" in d or "rocky" in d or "sandy" in d or "waste" in d or "rann" in d or "salt" in d:
        return "barren"
    return "unknown"


def fetch_one(idx: int, lat: float, lon: float, token: str) -> tuple[int, str | None]:
    """Query Bhuvan for a single point. Returns (index, land_use_class)."""
    for attempt in range(3):
        try:
            r = requests.get(
                API_URL,
                params={"lon": round(lon, 4), "lat": round(lat, 4), "year": YEAR, "token": token},
                timeout=30,
            )
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and data:
                    desc = data[0].get("Description", "")
                    return idx, map_lulc(desc)
                return idx, None
            return idx, None
        except Exception:
            if attempt < 2:
                import time
                time.sleep(2)
    return idx, None


def centroid(coords: list) -> tuple[float, float]:
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True, help="Bhuvan API token")
    args = parser.parse_args()

    print(f"Loading {HEX_FILE}...")
    with open(HEX_FILE) as f:
        gj = json.load(f)

    features = gj["features"]
    total = len(features)
    print(f"  {total} hexes to process")

    # Test API with a single point first
    print("Testing API connectivity...")
    test_lat, test_lon = 23.0, 77.0
    test_idx, test_result = fetch_one(0, test_lat, test_lon, args.token)
    if test_result is None:
        print("ERROR: API test failed. Check your token.")
        return
    print(f"  API test OK: ({test_lat}, {test_lon}) → {test_result}")

    # Prepare centroids
    centroids = [centroid(f["geometry"]["coordinates"][0]) for f in features]

    # Fetch with thread pool
    results: dict[int, str] = {}
    done = 0
    failed = 0
    raw_descriptions: dict[str, int] = {}

    print(f"Fetching LULC for {total} hexes with {WORKERS} workers...")
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(fetch_one, i, lat, lon, args.token): i
            for i, (lat, lon) in enumerate(centroids)
        }
        for future in as_completed(futures):
            idx, lulc = future.result()
            done += 1
            if lulc and lulc != "unknown":
                results[idx] = lulc
            elif lulc == "unknown":
                results[idx] = lulc
                failed += 1
            else:
                failed += 1

            if done % 500 == 0 or done == total:
                pct = done / total * 100
                print(f"  [{done:5d}/{total}] ({pct:.0f}%)  ok={len(results)}  failed={failed}")

    # Update GeoJSON
    updated = 0
    for i, feat in enumerate(features):
        if i in results:
            feat["properties"]["land_use"] = results[i]
            updated += 1

    # Count land use distribution
    lu_counts: dict[str, int] = {}
    for feat in features:
        lu = feat["properties"].get("land_use", "unknown")
        lu_counts[lu] = lu_counts.get(lu, 0) + 1

    print(f"\nLand use distribution:")
    for lu, count in sorted(lu_counts.items(), key=lambda x: -x[1]):
        print(f"  {lu:12s}: {count:5d} ({count/total*100:.1f}%)")

    print(f"\nSaving {HEX_FILE}...")
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f, separators=(",", ":"))

    print(f"Done. Updated {updated}/{total} hexes. Failed: {failed}")


if __name__ == "__main__":
    main()
