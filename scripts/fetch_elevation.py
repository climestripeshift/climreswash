"""
Fetch real SRTM 90m elevation for all H3 hex centroids via opentopodata.org.
No API key required. Updates elevation_mean in india_hex_grid.geojson.

Run: python scripts/fetch_elevation.py
"""
import json
import time
import requests
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
HEX_FILE  = ROOT / "client/public/data/india_hex_grid.geojson"
API_URL   = "https://api.opentopodata.org/v1/srtm90m"
BATCH     = 100   # max locations per request (API limit)
DELAY     = 1.1   # seconds between batches (stay under 1 req/s limit)


def centroid(coords):
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def fetch_batch(locations: list[tuple]) -> list[float | None]:
    loc_str = "|".join(f"{lat},{lon}" for lat, lon in locations)
    for attempt in range(3):
        try:
            r = requests.get(API_URL, params={"locations": loc_str}, timeout=30)
            if r.status_code == 429:
                wait = 5 * (attempt + 1)
                print(f"    Rate limited — waiting {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            if data.get("status") != "OK":
                print(f"    API status: {data.get('status')} — {data.get('error','')}")
                return [None] * len(locations)
            return [res["elevation"] for res in data["results"]]
        except Exception as e:
            print(f"    Attempt {attempt+1} failed: {e}")
            time.sleep(3)
    return [None] * len(locations)


def main():
    print(f"Loading {HEX_FILE}...")
    with open(HEX_FILE) as f:
        gj = json.load(f)

    features = gj["features"]
    print(f"  {len(features)} hexes")

    centroids = [centroid(feat["geometry"]["coordinates"][0]) for feat in features]

    elevations: list[float | None] = []
    total_batches = (len(centroids) + BATCH - 1) // BATCH

    print(f"Fetching elevation in {total_batches} batches (SRTM 90m, opentopodata.org)...")
    for i in range(0, len(centroids), BATCH):
        batch_locs = centroids[i : i + BATCH]
        batch_num  = i // BATCH + 1

        result = fetch_batch(batch_locs)
        elevations.extend(result)

        if batch_num % 10 == 0 or batch_num == total_batches:
            done    = len(elevations)
            valid   = [e for e in elevations if e is not None]
            pct     = done / len(centroids) * 100
            elev_rng = f"{min(valid):.0f}–{max(valid):.0f}m" if valid else "n/a"
            print(f"  [{batch_num:3d}/{total_batches}]  {done:5d}/{len(centroids)}  ({pct:.0f}%)  range so far: {elev_rng}")

        if i + BATCH < len(centroids):
            time.sleep(DELAY)

    # Fill any nulls with median
    valid = [e for e in elevations if e is not None]
    median = sorted(valid)[len(valid) // 2] if valid else 200.0
    null_count = sum(1 for e in elevations if e is None)
    if null_count:
        print(f"  {null_count} nulls — filling with median {median:.0f}m")

    for feat, elev in zip(features, elevations):
        feat["properties"]["elevation_mean"] = round(elev if elev is not None else median, 1)

    print(f"Saving {HEX_FILE}...")
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f)

    print(f"\nDone.")
    print(f"  Elevation range : {min(valid):.0f}m – {max(valid):.0f}m")
    print(f"  Null / fallback : {null_count} / {len(elevations)}")


if __name__ == "__main__":
    main()
