"""
Compute real population per hex from WorldPop 100m raster using zonal stats.
Updates india_hex_props.json + india_hex_grid.geojson with real pop_total.

Requires: data/raw/worldpop/ind_ppp_2020_UNadj_constrained.tif (~466MB)
Download from: https://www.worldpop.org/geodata/listing?id=78

Run: python scripts/compute_population.py
"""
import json
import os
from pathlib import Path

import h3
import numpy as np
import rasterio
from rasterio.windows import from_bounds

ROOT       = Path(__file__).resolve().parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO    = ROOT / "client/public/data/india_hex_grid.geojson"
POP_RASTER = ROOT / "data/raw/worldpop/ind_ppp_2020_UNadj_constrained.tif"


def sum_population_in_hex(src, h3_id: str) -> float:
    """Read raster window for hex bounding box and sum valid pixels."""
    boundary = h3.cell_to_boundary(h3_id)  # [(lat, lng), ...]
    lats = [b[0] for b in boundary]
    lngs = [b[1] for b in boundary]
    min_lng, max_lng = min(lngs), max(lngs)
    min_lat, max_lat = min(lats), max(lats)

    try:
        window = from_bounds(min_lng, min_lat, max_lng, max_lat, src.transform)
        # Clamp to raster bounds
        window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        if window.width < 1 or window.height < 1:
            return 0.0
        data = src.read(1, window=window)
        valid = data[data != src.nodata]
        return float(valid.sum()) if len(valid) > 0 else 0.0
    except Exception:
        return 0.0


def main():
    if not POP_RASTER.exists():
        print(f"ERROR: {POP_RASTER} not found.")
        print("Download from https://www.worldpop.org/geodata/listing?id=78")
        return

    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    print(f"Computing population from {POP_RASTER.name}...")
    updated = 0
    pops = []

    with rasterio.open(str(POP_RASTER)) as src:
        print(f"  Raster: {src.shape}, bounds: {src.bounds}")
        for i, p in enumerate(props):
            pop = sum_population_in_hex(src, p["h3_id"])
            if pop > 0:
                p["population"] = round(pop)
                pops.append(round(pop))
                updated += 1
            else:
                p["population"] = p.get("population", 0)

            if (i + 1) % 2000 == 0 or i == len(props) - 1:
                print(f"  [{i+1}/{len(props)}] {updated} hexes with population data")

    # Stats
    if pops:
        total = sum(pops)
        print(f"\nResults:")
        print(f"  Total population: {total:,.0f}")
        print(f"  Updated hexes:    {updated}/{len(props)}")
        print(f"  Range:            {min(pops):,} – {max(pops):,}")
        print(f"  Mean per hex:     {total // len(pops):,}")

    # Save props
    print(f"Saving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    # Also update the GeoJSON
    if HEX_GEO.exists():
        print(f"Updating {HEX_GEO}...")
        with open(HEX_GEO) as f:
            gj = json.load(f)
        props_by_id = {p["h3_id"]: p for p in props}
        for feat in gj["features"]:
            h3_id = feat["properties"].get("h3_id")
            if h3_id in props_by_id:
                feat["properties"]["population"] = props_by_id[h3_id]["population"]
        with open(HEX_GEO, "w") as f:
            json.dump(gj, f, separators=(",", ":"))

    print(f"\nDone. Props: {os.path.getsize(HEX_PROPS) // 1024} KB")


if __name__ == "__main__":
    main()
