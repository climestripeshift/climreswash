"""
Compute real population per hex from WorldPop 100m raster using zonal stats.
Updates india_hex_props.json + india_hex_grid.geojson with real pop_total
plus demographic sub-groups derived from Census 2011 state-level age ratios.

Requires: data/raw/worldpop/ind_ppp_2020_UNadj_constrained.tif (~466MB)
Download from: https://www.worldpop.org/geodata/listing?id=78

Run: python scripts/compute_population.py

Fix (v2): uses polygon masking instead of bounding box to avoid double-counting
pixels at hex boundaries. Bounding-box approach caused ~38% overcount (1.9B → 1.4B).
"""
import json
import os
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import h3
import numpy as np
import rasterio
import rasterio.windows
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds

ROOT       = Path(__file__).resolve().parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO    = ROOT / "client/public/data/india_hex_grid.geojson"
POP_RASTER = ROOT / "data/raw/worldpop/ind_ppp_2020_UNadj_constrained.tif"

# Census 2011 state-level age/sex ratios — applied to per-hex population total
# Source: Census 2011 primary census abstracts
CHILD_RATIO  = 0.094   # Children under 5  (~9.4% of population)
ELDERLY_RATIO = 0.081  # Elderly 60+        (~8.1%)
WOMEN_RATIO   = 0.256  # Women 15-49        (~25.6%)


def sum_population_in_hex(src, h3_id: str) -> float:
    """
    Sum WorldPop pixels within the exact H3 hex polygon boundary.

    Reads the bounding-box window for efficiency, then applies a polygon mask
    so only pixels whose centres fall inside the hex are counted — preventing
    the double-counting that occurred when adjacent bounding boxes overlapped.
    """
    boundary = h3.cell_to_boundary(h3_id)  # [(lat, lng), ...]
    lats = [b[0] for b in boundary]
    lngs = [b[1] for b in boundary]
    min_lng, max_lng = min(lngs), max(lngs)
    min_lat, max_lat = min(lats), max(lats)

    try:
        window = from_bounds(min_lng, min_lat, max_lng, max_lat, src.transform)
        window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        if window.width < 1 or window.height < 1:
            return 0.0

        data = src.read(1, window=window)
        win_transform = src.window_transform(window)

        # Polygon in (lng, lat) order as a GeoJSON-like dict
        coords = [(lng, lat) for lat, lng in boundary]
        coords.append(coords[0])  # close the ring
        geom = {"type": "Polygon", "coordinates": [coords]}

        # True where pixels are INSIDE the hex polygon
        poly_mask = geometry_mask(
            [geom],
            transform=win_transform,
            invert=True,
            out_shape=data.shape,
        )

        nodata = src.nodata
        if nodata is not None:
            valid_mask = poly_mask & (data != nodata)
        else:
            valid_mask = poly_mask & (data > -9999)

        valid = data[valid_mask]
        return float(valid[valid > 0].sum()) if len(valid) > 0 else 0.0

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

    print(f"Computing population (polygon-masked) from {POP_RASTER.name}...")
    updated = 0
    pops = []

    with rasterio.open(str(POP_RASTER)) as src:
        print(f"  Raster: {src.shape}, bounds: {src.bounds}, nodata: {src.nodata}")
        for i, p in enumerate(props):
            pop = sum_population_in_hex(src, p["h3_id"])
            if pop > 0:
                p["population"] = round(pop)
                pops.append(round(pop))
                updated += 1
            else:
                p["population"] = 0

            # Demographic sub-groups from Census 2011 age/sex ratios
            base = p["population"]
            p["pop_children_under_5"] = round(base * CHILD_RATIO)
            p["pop_elderly_60plus"]   = round(base * ELDERLY_RATIO)
            p["pop_women_15_49"]      = round(base * WOMEN_RATIO)

            if (i + 1) % 2000 == 0 or i == len(props) - 1:
                print(f"  [{i+1}/{len(props)}] {updated} hexes updated")

    # Stats
    if pops:
        total = sum(pops)
        total_children = sum(p.get("pop_children_under_5", 0) for p in props)
        total_elderly  = sum(p.get("pop_elderly_60plus", 0) for p in props)
        total_women    = sum(p.get("pop_women_15_49", 0) for p in props)
        print(f"\nResults:")
        print(f"  Total population:   {total:,.0f}  ({total/1e9:.3f}B)")
        print(f"  Children under 5:   {total_children:,.0f}  ({total_children/1e6:.0f}M)")
        print(f"  Elderly 60+:        {total_elderly:,.0f}  ({total_elderly/1e6:.0f}M)")
        print(f"  Women 15-49:        {total_women:,.0f}  ({total_women/1e6:.0f}M)")
        print(f"  Updated hexes:      {updated}/{len(props)}")
        print(f"  Range:              {min(pops):,} – {max(pops):,}")
        print(f"  Mean per hex:       {total // len(pops):,}")

    # Save props
    print(f"\nSaving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    # Also update the GeoJSON
    demo_fields = ["population", "pop_children_under_5", "pop_elderly_60plus", "pop_women_15_49"]
    if HEX_GEO.exists():
        print(f"Updating {HEX_GEO}...")
        with open(HEX_GEO) as f:
            gj = json.load(f)
        props_by_id = {p["h3_id"]: p for p in props}
        for feat in gj["features"]:
            h3_id = feat["properties"].get("h3_id")
            if h3_id in props_by_id:
                src_p = props_by_id[h3_id]
                for field in demo_fields:
                    feat["properties"][field] = src_p[field]
        with open(HEX_GEO, "w") as f:
            json.dump(gj, f, separators=(",", ":"))

    print(f"\nDone. Props: {os.path.getsize(HEX_PROPS) // 1024} KB")


if __name__ == "__main__":
    main()
