"""
Compute hazard likelihood per hex from climatology frequency rasters.
If rasters missing → MOCK MODE with geographically-plausible values.

Adds 7 likelihood columns (0–1) to india_hex_props.json.

Run: python scripts/compute_likelihood.py
"""
import json
import math
import random
import sys
from pathlib import Path

import h3

ROOT      = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO   = ROOT / "client/public/data/india_hex_grid.geojson"
RASTER_DIR = ROOT / "data/raw/climatology"

# ── Normalization references (tunable) ────────────────────────────────────────
# Each maps: raster filename → (column_name, reference_value_for_1.0)
LIKELIHOOD_CONFIG = [
    # Tuned from actual GEE raster distributions (p50/p90/max):
    ("flood_freq.tif",         "flood_likelihood",         8.0),    # p90=7.2, max=34. 8 days/yr >50mm = 1.0
    ("extreme_rain_freq.tif",  "extreme_rain_likelihood",  3.0),    # p99=7.4, max=14.6. 3 days/yr >100mm = 1.0
    ("heat_freq.tif",          "heat_likelihood",           45.0),   # p90=42.9, max=100.7. 45 days/yr >40°C = 1.0
    ("severe_heat_freq.tif",   "severe_heat_likelihood",   5.0),    # p99=5.2, max=12.5. 5 days/yr >45°C = 1.0
    ("drought_freq.tif",       "drought_likelihood",        0.5),    # p75=0.36, max=0.71. 50% months dry = 1.0
    ("high_wind_freq.tif",     "high_wind_likelihood",     0.05),   # max=0.07. ERA5 doesn't capture gusts well
    ("wet_bulb_freq.tif",      "wet_bulb_likelihood",      200.0),  # median=131, max=271. 200 days/yr Tw>28°C = 1.0
]

# ── Geographic mock patterns (used when rasters are absent) ───────────────────
# Based on India's actual climate zones

def mock_flood_likelihood(lat: float, lon: float, ndvi: float) -> float:
    """High in NE India, Western Ghats, Kerala; low in Rajasthan/Thar."""
    base = 0.1
    if lon > 88 and lat > 22:  base = 0.7   # NE India (Assam, Meghalaya)
    elif lon < 77 and lat < 16: base = 0.6   # Kerala / Konkan coast
    elif 73 < lon < 77 and 14 < lat < 20: base = 0.55  # Western Ghats
    elif lon > 85 and lat < 22: base = 0.5   # Odisha coast
    elif 79 < lon < 88 and 24 < lat < 28: base = 0.45  # Bihar / Bengal monsoon
    elif lon < 74 and lat > 24: base = 0.05  # Rajasthan (desert)
    elif lon < 73 and lat > 20: base = 0.08  # Gujarat dry
    base += ndvi * 0.15  # wetter areas have more vegetation
    return min(1.0, base + random.uniform(-0.05, 0.05))

def mock_heat_likelihood(lat: float, lon: float, elev: float) -> float:
    """High in Rajasthan, Vidarbha, central India; low in hills/coast."""
    if elev > 1500: return max(0, 0.05 + random.uniform(0, 0.05))
    if lon < 76 and 24 < lat < 30: return min(1.0, 0.85 + random.uniform(-0.05, 0.05))  # Rajasthan
    if 76 < lon < 82 and 20 < lat < 25: return min(1.0, 0.7 + random.uniform(-0.05, 0.05))  # Vidarbha/MP
    if lat > 28: return max(0, 0.3 + random.uniform(-0.1, 0.1))  # North plains
    if lon < 77 and lat < 14: return 0.15  # Kerala coast
    return min(1.0, 0.4 + random.uniform(-0.1, 0.1))

def mock_drought_likelihood(lat: float, lon: float, ndvi: float) -> float:
    """High in Rajasthan, Gujarat, Marathwada; low in NE/Kerala."""
    if lon < 74 and lat > 24: return min(1.0, 0.7 + random.uniform(-0.05, 0.05))  # Rajasthan
    if lon < 73 and 20 < lat < 24: return min(1.0, 0.55 + random.uniform(-0.05, 0.05))  # Gujarat
    if 75 < lon < 79 and 17 < lat < 21: return 0.5  # Marathwada
    if lon > 88: return 0.05  # NE India
    if lon < 77 and lat < 14: return 0.05  # Kerala
    return max(0, 0.25 - ndvi * 0.3 + random.uniform(-0.05, 0.05))

def mock_wetbulb_likelihood(lat: float, lon: float, ndvi: float) -> float:
    """High in humid coastal + riverine; low in dry interior."""
    if lon > 86 and lat < 24: return min(1.0, 0.65 + random.uniform(-0.05, 0.05))  # Bengal coast
    if lon < 77 and lat < 14: return min(1.0, 0.55 + random.uniform(-0.05, 0.05))  # Kerala
    if 80 < lon < 86 and 24 < lat < 28: return 0.45  # Bihar (humid plains)
    if lon < 74 and lat > 24: return 0.05  # Rajasthan (dry)
    return max(0, 0.2 + ndvi * 0.2 + random.uniform(-0.05, 0.05))

def mock_wind_likelihood(lat: float, lon: float, elev: float) -> float:
    """High in coastal, passes; low inland."""
    if lon > 86 and lat < 22: return 0.3  # East coast
    if lon < 74 and lat < 20: return 0.25  # West coast
    if elev > 2000: return 0.2  # Mountain passes
    return max(0, 0.05 + random.uniform(0, 0.05))


def main():
    random.seed(42)

    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # Check which rasters exist
    has_rasters = all((RASTER_DIR / cfg[0]).exists() for cfg in LIKELIHOOD_CONFIG)

    if has_rasters:
        print("REAL MODE — reading frequency rasters via zonal stats...")
        import rasterio
        from rasterio.windows import from_bounds

        for raster_name, col_name, ref_val in LIKELIHOOD_CONFIG:
            raster_path = RASTER_DIR / raster_name
            print(f"  Processing {raster_name} → {col_name}...")
            with rasterio.open(str(raster_path)) as src:
                for p in props:
                    boundary = h3.cell_to_boundary(p["h3_id"])
                    lats = [b[0] for b in boundary]
                    lngs = [b[1] for b in boundary]
                    try:
                        window = from_bounds(min(lngs), min(lats), max(lngs), max(lats), src.transform)
                        window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                        if window.width < 1 or window.height < 1:
                            p[col_name] = 0.0
                            continue
                        data = src.read(1, window=window)
                        valid = data[(data != src.nodata) & (data > -9999)]
                        if len(valid) > 0:
                            freq = float(valid.mean())
                            days_col = col_name.replace("_likelihood", "_days_per_year")
                            p[days_col] = round(freq, 2)
                            p[col_name] = round(min(1.0, max(0.0, freq / ref_val)), 3)
                        else:
                            days_col = col_name.replace("_likelihood", "_days_per_year")
                            p[days_col] = 0.0
                            p[col_name] = 0.0
                    except Exception:
                        p[col_name] = 0.0
    else:
        print("⚠️  MOCK MODE — frequency rasters not found in data/raw/climatology/")
        print("   Run the GEE script (scripts/gee_climatology.js) to get real data.")
        print("   Generating geographically-plausible mock likelihoods...\n")

        for p in props:
            boundary = h3.cell_to_boundary(p["h3_id"])
            lat = sum(b[0] for b in boundary) / len(boundary)
            lon = sum(b[1] for b in boundary) / len(boundary)
            elev = float(p.get("elevation_mean", 200) or 200)
            ndvi = float(p.get("ndvi_mean", 0.3) or 0.3)

            p["flood_likelihood"]         = round(mock_flood_likelihood(lat, lon, ndvi), 3)
            p["extreme_rain_likelihood"]  = round(p["flood_likelihood"] * 0.3, 3)
            p["heat_likelihood"]          = round(mock_heat_likelihood(lat, lon, elev), 3)
            p["severe_heat_likelihood"]   = round(p["heat_likelihood"] * 0.25, 3)
            p["drought_likelihood"]       = round(mock_drought_likelihood(lat, lon, ndvi), 3)
            p["high_wind_likelihood"]     = round(mock_wind_likelihood(lat, lon, elev), 3)
            p["wet_bulb_likelihood"]      = round(mock_wetbulb_likelihood(lat, lon, ndvi), 3)

    # Stats
    for col_name in [cfg[1] for cfg in LIKELIHOOD_CONFIG]:
        vals = [p.get(col_name, 0) for p in props]
        print(f"  {col_name:30s}: {min(vals):.3f} – {max(vals):.3f}  (mean {sum(vals)/len(vals):.3f})")

    geo_cols = [cfg[1] for cfg in LIKELIHOOD_CONFIG] + \
               [cfg[1].replace("_likelihood", "_days_per_year") for cfg in LIKELIHOOD_CONFIG]

    # Update GeoJSON first — join_hex_districts.py reads these columns from here.
    # These are pipeline-internal inputs, not frontend-rendered fields.
    if HEX_GEO.exists():
        print(f"\nUpdating {HEX_GEO}...")
        with open(HEX_GEO) as f:
            gj = json.load(f)
        props_by_id = {p["h3_id"]: p for p in props}
        for feat in gj["features"]:
            h3_id = feat["properties"].get("h3_id")
            p = props_by_id.get(h3_id)
            if p is None:
                continue
            for col in geo_cols:
                if col in p:
                    feat["properties"][col] = p[col]
        with open(HEX_GEO, "w") as f:
            json.dump(gj, f, separators=(",", ":"))

    # Save HEX_PROPS WITHOUT the raw likelihood/day-count columns — the frontend
    # never renders them, and keeping them here previously caused a white-screen
    # crash from props file size (see commit 72ae7f6). Full data stays in GeoJSON.
    print(f"\nSaving {HEX_PROPS} (intermediate columns excluded)...")
    for p in props:
        for col in geo_cols:
            p.pop(col, None)
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    import os
    print(f"Done. {os.path.getsize(HEX_PROPS) // 1024} KB")


if __name__ == "__main__":
    main()
