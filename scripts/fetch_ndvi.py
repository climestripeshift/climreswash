"""
Fetch real MODIS NDVI for all H3 hex centroids via ORNL DAAC REST API.
No API key needed. Uses MOD13Q1 (250m, 16-day) Aug-Sep 2023 composites.

Run: python scripts/fetch_ndvi.py
"""
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT      = Path(__file__).resolve().parent.parent
HEX_FILE  = ROOT / "client/public/data/india_hex_grid.geojson"
CACHE     = ROOT / "scripts/.ndvi_cache.json"
API_URL   = "https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset"
WORKERS   = 5
# Aug 1 – Sep 30 2023 (peak greenness for India monsoon)
START     = "A2023209"
END       = "A2023273"


def fetch_ndvi(idx: int, lat: float, lon: float) -> tuple[int, float | None]:
    """Query ORNL MODIS for mean NDVI at a point. Scale factor 0.0001."""
    for attempt in range(3):
        try:
            r = requests.get(API_URL, params={
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "band": "250m_16_days_NDVI",
                "startDate": START,
                "endDate": END,
                "kmAboveBelow": 0,
                "kmLeftRight": 0,
            }, timeout=30)
            if r.status_code == 200:
                data = r.json()
                vals = []
                for subset in data.get("subset", []):
                    for v in subset.get("data", []):
                        v = float(v)
                        if v > -2000:  # valid NDVI
                            vals.append(v * 0.0001)
                if vals:
                    return idx, round(sum(vals) / len(vals), 3)
                return idx, None
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return idx, None
        except Exception:
            if attempt < 2:
                time.sleep(3)
    return idx, None


def centroid(coords: list) -> tuple[float, float]:
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def main():
    print(f"Loading {HEX_FILE}...")
    with open(HEX_FILE) as f:
        gj = json.load(f)

    features = gj["features"]
    total = len(features)

    # Load cache (resume support)
    cache: dict[str, float] = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text())
        print(f"  Loaded cache: {len(cache)} entries")

    centroids = [centroid(f["geometry"]["coordinates"][0]) for f in features]
    h3_ids = [f["properties"]["h3_id"] for f in features]

    # Skip already-cached hexes
    todo = [(i, lat, lon) for i, (lat, lon) in enumerate(centroids) if h3_ids[i] not in cache]
    print(f"  {total} hexes total, {len(todo)} to fetch ({total - len(todo)} cached)")

    if not todo:
        print("All hexes cached. Applying to GeoJSON...")
    else:
        # Test API
        print("Testing API...")
        test_i, test_v = fetch_ndvi(todo[0][0], todo[0][1], todo[0][2])
        if test_v is not None:
            cache[h3_ids[test_i]] = test_v
            todo = todo[1:]
            print(f"  API OK: NDVI = {test_v}")
        else:
            print("  WARNING: test returned None, continuing anyway...")

        done = total - len(todo)
        failed = 0

        print(f"Fetching NDVI for {len(todo)} hexes with {WORKERS} workers...")
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(fetch_ndvi, i, lat, lon): i for i, lat, lon in todo}
            for future in as_completed(futures):
                idx, ndvi = future.result()
                done += 1
                if ndvi is not None:
                    cache[h3_ids[idx]] = ndvi
                else:
                    failed += 1

                if done % 100 == 0 or done == total:
                    pct = done / total * 100
                    print(f"  [{done:5d}/{total}] ({pct:.0f}%)  cached={len(cache)}  failed={failed}")

                # Save cache periodically
                if done % 500 == 0:
                    CACHE.write_text(json.dumps(cache))

        CACHE.write_text(json.dumps(cache))
        print(f"  Cache saved: {len(cache)} entries")

    # Apply to GeoJSON
    updated = 0
    vals = []
    for feat in features:
        hid = feat["properties"]["h3_id"]
        if hid in cache:
            feat["properties"]["ndvi_mean"] = cache[hid]
            vals.append(cache[hid])
            updated += 1

    # Fill missing with median
    if vals:
        median = sorted(vals)[len(vals) // 2]
        for feat in features:
            if feat["properties"]["h3_id"] not in cache:
                feat["properties"]["ndvi_mean"] = median

    print(f"\nSaving {HEX_FILE}...")
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f, separators=(",", ":"))

    if vals:
        print(f"Done. NDVI range: {min(vals):.3f} – {max(vals):.3f}")
    print(f"  Updated: {updated}/{total}  Filled median: {total - updated}")


if __name__ == "__main__":
    main()
