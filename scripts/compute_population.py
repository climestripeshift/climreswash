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

import geopandas as gpd
import h3
from rasterstats import zonal_stats
from shapely.geometry import Polygon

ROOT       = Path(__file__).resolve().parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO    = ROOT / "client/public/data/india_hex_grid.geojson"
POP_RASTER = ROOT / "data/raw/worldpop/ind_ppp_2020_UNadj_constrained.tif"


def h3_to_polygon(h3_id: str) -> Polygon:
    boundary = h3.cell_to_boundary(h3_id)
    coords = [(lng, lat) for lat, lng in boundary]
    coords.append(coords[0])
    return Polygon(coords)


def main():
    if not POP_RASTER.exists():
        print(f"ERROR: {POP_RASTER} not found.")
        print("Download from https://www.worldpop.org/geodata/listing?id=78")
        return

    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # Build GeoDataFrame from hex props
    print("Building hex polygons from h3_id...")
    geometries = [h3_to_polygon(p["h3_id"]) for p in props]
    gdf = gpd.GeoDataFrame(props, geometry=geometries, crs="EPSG:4326")

    # Zonal stats: sum population pixels per hex
    print(f"Computing zonal stats from {POP_RASTER.name} (this may take 5-10 min)...")
    results = zonal_stats(
        gdf, str(POP_RASTER),
        stats=["sum"],
        nodata=-99999,
        all_touched=True,
    )

    # Apply results
    updated = 0
    pops = []
    for i, (p, r) in enumerate(zip(props, results)):
        pop = r.get("sum")
        if pop is not None and pop > 0:
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
