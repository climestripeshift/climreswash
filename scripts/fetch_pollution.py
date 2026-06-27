"""
Extract real PM2.5 per hex from WashU satellite NetCDF files.
Averages 2021-2023 annual means for a stable estimate.

Run: python scripts/fetch_pollution.py
"""
import json
import os
from pathlib import Path

import h3
import netCDF4
import numpy as np

ROOT     = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO   = ROOT / "client/public/data/india_hex_grid.geojson"
PM_DIR    = ROOT / "data/raw/pollution"

PM_FILES = sorted(PM_DIR.glob("*.nc"))


def main():
    print(f"Loading PM2.5 files from {PM_DIR}...")
    datasets = []
    for f in PM_FILES:
        ds = netCDF4.Dataset(str(f))
        datasets.append(ds)
        print(f"  {f.name}")

    if not datasets:
        print("ERROR: No NetCDF files found")
        return

    # Use first file for lat/lon grid
    lat = datasets[0].variables["lat"][:]
    lon = datasets[0].variables["lon"][:]

    # Average PM2.5 across all years
    print("Computing multi-year average...")
    pm_sum = None
    for ds in datasets:
        pm = ds.variables["PM25"][:]
        if pm_sum is None:
            pm_sum = pm.astype(float)
        else:
            pm_sum += pm.astype(float)
    pm_avg = pm_sum / len(datasets)

    # Close datasets
    for ds in datasets:
        ds.close()

    print(f"  Grid: {pm_avg.shape}, lat {lat.min():.1f}-{lat.max():.1f}, lon {lon.min():.1f}-{lon.max():.1f}")

    # Load hex props
    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # Extract PM2.5 per hex centroid (nearest pixel)
    print("Extracting PM2.5 per hex...")
    updated = 0
    for p in props:
        boundary = h3.cell_to_boundary(p["h3_id"])
        clat = sum(b[0] for b in boundary) / len(boundary)
        clon = sum(b[1] for b in boundary) / len(boundary)

        lat_idx = int(np.argmin(np.abs(lat - clat)))
        lon_idx = int(np.argmin(np.abs(lon - clon)))

        val = float(pm_avg[lat_idx, lon_idx])
        if not np.isnan(val) and val > 0:
            p["pm25_annual"] = round(val, 1)
            updated += 1
        else:
            p["pm25_annual"] = p.get("pm25_annual", 15)

    print(f"  Updated {updated}/{len(props)} hexes with real PM2.5")

    # Stats
    vals = [p["pm25_annual"] for p in props]
    print(f"  PM2.5 range: {min(vals):.1f} – {max(vals):.1f} (mean {sum(vals)/len(vals):.1f})")

    # Sample cities
    for name in ["Jhajjar", "Mumbai Suburban", "Jaisalmer", "Wayanad", "Patna"]:
        for p in props:
            if p.get("district_name") == name:
                print(f"    {name}: {p['pm25_annual']} ug/m3")
                break

    # Save
    print(f"Saving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    # Update GeoJSON too
    if HEX_GEO.exists():
        print(f"Updating {HEX_GEO}...")
        with open(HEX_GEO) as f:
            gj = json.load(f)
        pbi = {p["h3_id"]: p for p in props}
        for feat in gj["features"]:
            h = feat["properties"].get("h3_id")
            if h in pbi:
                feat["properties"]["pm25_annual"] = pbi[h]["pm25_annual"]
        with open(HEX_GEO, "w") as f:
            json.dump(gj, f, separators=(",", ":"))

    print(f"Done. Props: {os.path.getsize(HEX_PROPS) // 1024} KB")


if __name__ == "__main__":
    main()
