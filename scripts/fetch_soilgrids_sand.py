"""
Fetch real soil sand-content % for all of India from ISRIC SoilGrids (WCS
raster service), to replace the flat land-use-based lookup table
(LAND_USE_PARAMS in scripts/risk/hex_risk.py) that currently assigns every
hex the SAME sand_pct purely from its land-cover class (e.g. every "crop"
hex nationally gets 25%, regardless of whether it's Thar desert sand or
Gangetic clay) -- a real, spatially-varying input feeding 4 of the 10
hazard channels (flood, drought, flashflood, fire).

Source: ISRIC SoilGrids v2.0, sand_0-5cm_mean, 250m native resolution,
free, no auth. NOTE: SoilGrids' REST point-query API
(rest.isric.org/soilgrids/v2.0/properties/query) returns null for every
Indian coordinate tested -- an API-specific gap, not a real data gap (the
WCS raster endpoint used here has full, verified India coverage). Chunked
into 5x5-degree tiles (India's full extent at native 250m resolution in
one request 503s -- too large for a single synchronous call), same
resumable/cached pattern as fetch_villages_osm.py and fetch_schools_osm.py.

Cache: data/raw/soilgrids/sand_<lon0>_<lat0>.tif (one file per tile,
skipped if already present)
Output: client/public/data/hex_soil_sand.json -- {h3_id: sand_pct}, one
real value per hex (sampled at the hex's own centroid against whichever
tile contains it), for all 41 res-5 grid hexes.

Run: python scripts/fetch_soilgrids_sand.py
"""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import h3
import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data/raw/soilgrids"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT = ROOT / "client/public/data/hex_soil_sand.json"

WCS_URL = ("https://maps.isric.org/mapserv?map=/map/sand.map&SERVICE=WCS&VERSION=2.0.1"
           "&REQUEST=GetCoverage&COVERAGEID=sand_0-5cm_mean&FORMAT=image/tiff"
           "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
           "&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
           "&SUBSET=Lat({lat0},{lat1})&SUBSET=Long({lon0},{lon1})")

# India's full extent, in 5x5-degree tiles -- generous margin beyond the mainland
# (covers Andaman/Nicobar and Lakshadweep too, harmless if a tile is mostly ocean)
LON_RANGE = (67, 99)
LAT_RANGE = (5, 38)
TILE_DEG = 5

D_FACTOR = 10  # SoilGrids reports g/kg with this scale factor -> divide by 10 for %


def tile_bounds():
    lon = LON_RANGE[0]
    while lon < LON_RANGE[1]:
        lat = LAT_RANGE[0]
        lon1 = min(lon + TILE_DEG, LON_RANGE[1])
        while lat < LAT_RANGE[1]:
            lat1 = min(lat + TILE_DEG, LAT_RANGE[1])
            yield lon, lat, lon1, lat1
            lat += TILE_DEG
        lon += TILE_DEG


def fetch_tile(lon0: float, lat0: float, lon1: float, lat1: float, retries: int = 3) -> Path:
    cache_path = CACHE_DIR / f"sand_{lon0}_{lat0}.tif"
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path

    url = WCS_URL.format(lat0=lat0, lat1=lat1, lon0=lon0, lon1=lon1)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ClimResWASH/1.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
            if data[:4] not in (b"II*\x00", b"MM\x00*"):  # not a valid TIFF header
                raise ValueError(f"non-TIFF response ({len(data)} bytes): {data[:200]}")
            cache_path.write_bytes(data)
            return cache_path
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError) as e:
            wait = 15 * (attempt + 1)
            print(f"    error ({e}), retrying in {wait}s...")
            time.sleep(wait)
    raise RuntimeError(f"failed to fetch tile ({lon0},{lat0})-({lon1},{lat1}) after {retries} retries")


def main():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    tiles = list(tile_bounds())
    print(f"Fetching {len(tiles)} tiles ({TILE_DEG}x{TILE_DEG} degrees each)...")
    tile_paths = []
    for i, (lon0, lat0, lon1, lat1) in enumerate(tiles):
        cache_path = CACHE_DIR / f"sand_{lon0}_{lat0}.tif"
        if cache_path.exists() and cache_path.stat().st_size > 0:
            print(f"  [{i+1}/{len(tiles)}] ({lon0},{lat0})-({lon1},{lat1}): cached")
        else:
            print(f"  [{i+1}/{len(tiles)}] ({lon0},{lat0})-({lon1},{lat1}): fetching...", end=" ", flush=True)
            fetch_tile(lon0, lat0, lon1, lat1)
            print("done")
            time.sleep(2)
        tile_paths.append((cache_path, lon0, lat0, lon1, lat1))

    print(f"\nLoading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    # Open all tile rasters once, sample per-hex centroid against whichever tile contains it
    print("\nOpening tile rasters...")
    opened = [(rasterio.open(p), lon0, lat0, lon1, lat1) for p, lon0, lat0, lon1, lat1 in tile_paths]

    result: dict[str, float] = {}
    no_tile = 0
    no_value = 0
    for p in props:
        h3_id = p["h3_id"]
        lat, lon = h3.cell_to_latlng(h3_id)
        src = None
        for ds, lon0, lat0, lon1, lat1 in opened:
            if lon0 <= lon <= lon1 and lat0 <= lat <= lat1:
                src = ds
                break
        if src is None:
            no_tile += 1
            continue
        try:
            row, col = src.index(lon, lat)
            window_vals = src.read(1, window=((max(0, row - 1), row + 2), (max(0, col - 1), col + 2)))
            valid = window_vals[window_vals != (src.nodata if src.nodata is not None else -999999)]
            valid = valid[~np.isnan(valid.astype(float))] if valid.size else valid
            if valid.size == 0:
                no_value += 1
                continue
            sand_pct = float(np.median(valid)) / D_FACTOR
            result[h3_id] = round(sand_pct, 1)
        except Exception:
            no_value += 1
            continue

    for ds, *_ in opened:
        ds.close()

    print(f"\n{len(result)}/{len(props)} hexes got a real sand_pct value")
    print(f"  {no_tile} outside all fetched tiles, {no_value} inside a tile but no valid pixel (water/nodata)")
    vals = list(result.values())
    if vals:
        print(f"  range: {min(vals):.1f}% - {max(vals):.1f}%, mean {sum(vals)/len(vals):.1f}%")

    OUT.write_text(json.dumps(result, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT} ({os.path.getsize(OUT)//1024}KB)")


if __name__ == "__main__":
    main()
