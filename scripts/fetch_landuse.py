"""
Fetch real ESA WorldCover 2021 land use for all H3 hex centroids.
Reads directly from Cloud Optimized GeoTIFFs on S3 — no download needed.

Run: python scripts/fetch_landuse.py
"""
import json
import math
from collections import defaultdict
from pathlib import Path

import rasterio

ROOT     = Path(__file__).resolve().parent.parent
HEX_FILE = ROOT / "client/public/data/india_hex_grid.geojson"

S3_BASE  = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"

# ESA WorldCover class codes → our labels
LC_MAP = {
    10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built",
    60: "barren", 70: "snow", 80: "water", 90: "wetland", 95: "mangrove",
}


def tile_name(lat: float, lon: float) -> str:
    """Get ESA WorldCover tile name for a given lat/lon.
    Tiles are 3°×3°, named by SW corner: N{lat}E{lon} or N{lat}W{lon}."""
    tile_lat = int(math.floor(lat / 3) * 3)
    tile_lon = int(math.floor(lon / 3) * 3)
    ns = "N" if tile_lat >= 0 else "S"
    ew = "E" if tile_lon >= 0 else "W"
    return f"{ns}{abs(tile_lat):02d}{ew}{abs(tile_lon):03d}"


def tile_url(name: str) -> str:
    return f"{S3_BASE}/ESA_WorldCover_10m_2021_v200_{name}_Map.tif"


def main():
    print(f"Loading {HEX_FILE}...")
    with open(HEX_FILE) as f:
        gj = json.load(f)

    features = gj["features"]
    total = len(features)
    print(f"  {total} hexes")

    # Group hex centroids by tile
    print("Grouping centroids by ESA WorldCover tile...")
    tile_groups: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for i, feat in enumerate(features):
        coords = feat["geometry"]["coordinates"][0]
        lon = sum(c[0] for c in coords) / len(coords)
        lat = sum(c[1] for c in coords) / len(coords)
        tn = tile_name(lat, lon)
        tile_groups[tn].append((i, lon, lat))

    print(f"  {len(tile_groups)} tiles to read")

    # Read each tile and sample all its centroids
    results: dict[int, str] = {}
    failed_tiles = []

    for ti, (tn, points) in enumerate(sorted(tile_groups.items())):
        url = tile_url(tn)
        try:
            with rasterio.open(url) as src:
                xy_pairs = [(lon, lat) for _, lon, lat in points]
                for (idx, _, _), val in zip(points, src.sample(xy_pairs)):
                    code = int(val[0])
                    if code in LC_MAP:
                        results[idx] = LC_MAP[code]
                    elif code == 0:
                        results[idx] = "water"  # nodata over ocean
            print(f"  [{ti+1:3d}/{len(tile_groups)}] {tn}: {len(points)} hexes OK")
        except Exception as e:
            failed_tiles.append(tn)
            print(f"  [{ti+1:3d}/{len(tile_groups)}] {tn}: FAILED ({e})")

    print(f"\nMatched {len(results)}/{total} hexes. Failed tiles: {len(failed_tiles)}")

    # Apply results
    updated = 0
    for i, feat in enumerate(features):
        if i in results:
            feat["properties"]["land_use"] = results[i]
            updated += 1

    # Distribution
    lu_counts: dict[str, int] = {}
    for feat in features:
        lu = feat["properties"].get("land_use", "?")
        lu_counts[lu] = lu_counts.get(lu, 0) + 1
    print("\nLand use distribution:")
    for k, v in sorted(lu_counts.items(), key=lambda x: -x[1]):
        print(f"  {k:12s} {v:5d} ({v/total*100:.1f}%)")

    print(f"\nSaving {HEX_FILE}...")
    with open(HEX_FILE, "w") as f:
        json.dump(gj, f, separators=(",", ":"))

    print(f"Done. Updated {updated}/{total} hexes with ESA WorldCover 2021.")


if __name__ == "__main__":
    main()
