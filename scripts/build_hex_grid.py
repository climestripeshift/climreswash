"""
Generate H3 hex grid for India and aggregate raster values per hex.

Inputs (in data/raw/):
  - india_elevation.tif (continuous, meters)
  - india_landcover.tif (categorical, ESA WorldCover codes)
  - india_ndvi.tif      (continuous, 0-1)

Output:
  - public/data/india_hex_grid.geojson
  - public/data/india_states.geojson

Run: python scripts/build_hex_grid.py
"""
import json
import random
import sys
from pathlib import Path

import geopandas as gpd
import h3
from shapely.geometry import Polygon, mapping

ROOT        = Path(__file__).resolve().parent.parent
DISTRICTS   = ROOT / "client/public/data/india.json"
STATES_OUT  = ROOT / "client/public/data/india_states.geojson"
HEX_OUT     = ROOT / "client/public/data/india_hex_grid.geojson"
H3_RES      = 5

LC_CLASSES = {
    10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built",
    60: "barren", 70: "snow", 80: "water", 90: "wetland", 95: "mangrove",
}

MOCK = not (
    (ROOT / "data/raw/india_elevation.tif").exists() and
    (ROOT / "data/raw/india_ndvi.tif").exists() and
    (ROOT / "data/raw/india_landcover.tif").exists()
)

if MOCK:
    print("⚠️  MOCK MODE — raw rasters not found in data/raw/. "
          "Generating geographically-plausible synthetic values.", file=sys.stderr)


# ── Mock value helpers ────────────────────────────────────────────────────────

def mock_elevation(lat: float, lng: float) -> float:
    if lat > 33:                              # High Himalayas / Ladakh
        return round(1800 + random.uniform(0, 3200), 1)
    if lat > 29 and lng < 82:                 # J&K / HP / Uttarakhand
        return round(600 + random.uniform(0, 2000), 1)
    if lat > 22 and lng > 89:                 # NE highlands
        return round(400 + random.uniform(0, 1400), 1)
    if 8 < lat < 20 and 73 < lng < 77.5:     # Western Ghats
        return round(400 + random.uniform(0, 1200), 1)
    if 15 < lat < 24:                         # Deccan plateau
        return round(300 + random.uniform(0, 450), 1)
    return round(40 + random.uniform(0, 180), 1)


def mock_ndvi(lat: float, lng: float) -> float:
    if lat > 22 and lng > 88:                 # NE India forests
        return round(0.52 + random.uniform(0, 0.28), 3)
    if lat < 14 and lng < 77.5:              # Kerala
        return round(0.50 + random.uniform(0, 0.28), 3)
    if 8 < lat < 20 and 73 < lng < 77.5:    # Western Ghats
        return round(0.45 + random.uniform(0, 0.25), 3)
    if lat > 25 and lng < 74:               # Rajasthan / Thar
        return round(0.04 + random.uniform(0, 0.14), 3)
    if lat > 22 and 68 < lng < 73:          # Gujarat dry zone
        return round(0.06 + random.uniform(0, 0.14), 3)
    if lat > 33:                             # Alpine / snow
        return round(0.05 + random.uniform(0, 0.15), 3)
    return round(0.25 + random.uniform(0, 0.28), 3)


def mock_land_use(lat: float, lng: float) -> str:
    if lat > 33:
        return random.choice(["snow", "snow", "barren"])
    if lat > 25 and lng < 74:
        return "barren"
    if lat > 22 and lng > 88:
        return "tree"
    if 8 < lat < 20 and 73 < lng < 77.5:
        return "tree"
    if 24 < lat < 29 and 76 < lng < 89:
        return random.choice(["crop", "crop", "crop", "built"])
    if lat < 18 and lng > 77:
        return random.choice(["crop", "crop", "tree", "grass"])
    if lat > 20 and 68 < lng < 73:
        return random.choice(["barren", "grass", "crop"])
    return random.choice(["crop", "crop", "grass", "shrub", "tree"])


# ── Geometry helpers ──────────────────────────────────────────────────────────

def shapely_to_h3shape(geom):
    """Convert a Shapely Polygon or MultiPolygon to an H3 shape."""
    if geom.geom_type == "Polygon":
        outer = [(lat, lng) for lng, lat in geom.exterior.coords]
        holes = [[(lat, lng) for lng, lat in ring.coords] for ring in geom.interiors]
        return h3.LatLngPoly(outer, *holes)
    elif geom.geom_type == "MultiPolygon":
        polys = []
        for poly in geom.geoms:
            outer = [(lat, lng) for lng, lat in poly.exterior.coords]
            holes = [[(lat, lng) for lng, lat in ring.coords] for ring in poly.interiors]
            polys.append(h3.LatLngPoly(outer, *holes))
        return h3.LatLngMultiPoly(*polys)
    raise ValueError(f"Unsupported geometry type: {geom.geom_type}")


def h3_to_shapely(cell_id: str) -> Polygon:
    boundary = h3.cell_to_boundary(cell_id)  # [(lat, lng), ...]
    return Polygon([(lng, lat) for lat, lng in boundary])


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    random.seed(42)

    # 1. Load districts, dissolve to states
    print(f"Loading {DISTRICTS}...")
    gdf = gpd.read_file(DISTRICTS)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    state_col = next(
        c for c in gdf.columns
        if c.upper() in ["STATE", "STNAME", "STATE_NAME", "STATENAME"]
    )
    print(f"  Dissolving {len(gdf)} districts → states (column: {state_col})")
    states = gdf[[state_col, "geometry"]].dissolve(by=state_col).reset_index()
    states = states.rename(columns={state_col: "state"})
    states.to_file(str(STATES_OUT), driver="GeoJSON")
    print(f"  Wrote {STATES_OUT} ({len(states)} states)")

    # 2. India boundary (union of all districts)
    print("Computing India boundary union...")
    india_geom = gdf.union_all() if hasattr(gdf, "union_all") else gdf.unary_union

    # 3. Generate H3 hexes
    print(f"Generating H3 res {H3_RES} hexes...")
    h3_shape = shapely_to_h3shape(india_geom)
    cell_ids = list(h3.h3shape_to_cells(h3_shape, H3_RES))
    print(f"  {len(cell_ids)} hexes generated")

    # 4. Build GeoDataFrame of hex polygons
    print("Building hex GeoDataFrame...")
    hex_polys = [h3_to_shapely(cid) for cid in cell_ids]
    hexes = gpd.GeoDataFrame({"h3_id": cell_ids}, geometry=hex_polys, crs="EPSG:4326")

    # 5. Tag hexes with state via spatial join
    print("Tagging hexes with state...")
    hexes_sj = gpd.sjoin(
        hexes, states[["state", "geometry"]],
        how="left", predicate="intersects"
    )
    hexes_sj = hexes_sj[~hexes_sj.index.duplicated(keep="first")]
    hexes["state"] = hexes_sj["state"].values

    # 6. Assign attribute values (mock or real)
    if MOCK:
        print("  Assigning MOCK elevation / NDVI / land_use from centroid geography...")
        centroids = hexes.geometry.centroid
        hexes["elevation_mean"] = [mock_elevation(c.y, c.x) for c in centroids]
        hexes["ndvi_mean"]      = [mock_ndvi(c.y, c.x)      for c in centroids]
        hexes["land_use"]       = [mock_land_use(c.y, c.x)  for c in centroids]
    else:
        from rasterstats import zonal_stats
        print("  Computing elevation_mean from raster...")
        hexes["elevation_mean"] = [
            round(r["mean"] or 0, 1)
            for r in zonal_stats(hexes, str(ROOT / "data/raw/india_elevation.tif"),
                                 stats=["mean"], nodata=-9999)
        ]
        print("  Computing ndvi_mean from raster...")
        hexes["ndvi_mean"] = [
            round(r["mean"] or 0, 3)
            for r in zonal_stats(hexes, str(ROOT / "data/raw/india_ndvi.tif"),
                                 stats=["mean"], nodata=-9999)
        ]
        print("  Computing dominant land cover...")
        lc_res = zonal_stats(hexes, str(ROOT / "data/raw/india_landcover.tif"),
                             categorical=True, nodata=0)
        def dominant(stats):
            if not stats:
                return "unknown"
            cls = max(stats, key=stats.get)
            return LC_CLASSES.get(int(cls), f"class_{cls}")
        hexes["land_use"] = [dominant(s) for s in lc_res]

    # 7. Drop hexes with no state (outside India boundary)
    before = len(hexes)
    hexes = hexes[hexes["state"].notna()].reset_index(drop=True)
    print(f"  Dropped {before - len(hexes)} out-of-bounds hexes; {len(hexes)} remain")

    # 8. Save
    HEX_OUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"Writing {HEX_OUT}...")
    hexes.to_file(str(HEX_OUT), driver="GeoJSON")
    print(f"Done. {len(hexes)} hexes · "
          f"elevation {hexes['elevation_mean'].min():.0f}–{hexes['elevation_mean'].max():.0f}m · "
          f"NDVI {hexes['ndvi_mean'].min():.3f}–{hexes['ndvi_mean'].max():.3f}")


if __name__ == "__main__":
    main()
