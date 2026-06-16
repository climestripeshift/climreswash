# Claude Code Brief — Hex Grid Base Map (Phase 0)

**Scope: this brief only. No risk scoring, no hazards, no forecasts.**

Build a map of India as a hexagonal grid (H3 resolution 5), where each hex carries three attributes: elevation, dominant land use class, and NDVI. User can toggle which attribute colors the grid, and filter by state.

This is the spatial foundation. Every layer added later (hazards, vulnerability, risk) will use the same hex grid.

---

## Why H3 hexagons (not districts, not squares)

- **Equal area** — every cell is ~252 km² regardless of where in India, so comparisons are fair
- **Industry standard** — used by Aqueduct, Foursquare, climate analytics platforms, insurance tools
- **Equal distance to neighbours** — six neighbours each the same distance, unlike squares (which have 4 close + 4 diagonal)
- **Multi-resolution** — can drill from res 5 (252 km²) to res 6 (36 km²) to res 7 (5 km²) later without rebuilding the system
- **Independent of admin boundaries** — risk doesn't stop at district lines

Start at **resolution 5** (~13,000 hexes for India, ~6 MB GeoJSON). Can go finer later when needed.

---

## Stack

- Python 3.10+ with `h3==4.*`, `geopandas`, `rasterio`, `rasterstats`, `shapely`
- React + react-leaflet (existing)
- No new frontend libraries needed (H3 hexes ship as regular GeoJSON polygons; frontend doesn't need h3-js)

---

## File structure for this phase

```
/scripts/
  build_hex_grid.py             # Single script — does everything
  requirements.txt
/data/raw/                      # User puts GEE-exported GeoTIFFs here (gitignored)
  india_elevation.tif
  india_landcover.tif           # ESA WorldCover, categorical
  india_ndvi.tif
/data/vectors/
  india_states.geojson          # Derived from existing districts
/public/data/
  india_hex_grid.geojson        # OUTPUT — what the frontend loads
  india_states.geojson          # State boundaries for filtering
/src/pages/
  HexMap.jsx                    # New page at /grid
/src/components/HexMap/
  Map.jsx                       # Leaflet map
  AttributeSelector.jsx         # Toggle between elevation / land use / NDVI
  StateFilter.jsx               # Dropdown of states
  Legend.jsx
  utils/colors.js
```

---

## Part 1 — Python pipeline (`scripts/build_hex_grid.py`)

```python
"""
Generate H3 hex grid for India and aggregate raster values per hex.

Inputs (in data/raw/):
  - india_elevation.tif (continuous, meters)
  - india_landcover.tif (categorical, ESA WorldCover codes)
  - india_ndvi.tif (continuous, 0-1)

Output:
  - public/data/india_hex_grid.geojson
  - public/data/india_states.geojson

Run: python scripts/build_hex_grid.py
"""
import h3
import geopandas as gpd
from shapely.geometry import Polygon
from rasterstats import zonal_stats
from pathlib import Path
import json

H3_RES = 5  # ~252 km² per hex, ~13k hexes for India
DISTRICTS_FILE = "data/raw/india_districts.geojson"
STATES_OUT     = "public/data/india_states.geojson"
HEX_OUT        = "public/data/india_hex_grid.geojson"

# ESA WorldCover class → human-readable label
LC_CLASSES = {
    10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built",
    60: "barren", 70: "snow", 80: "water", 90: "wetland", 95: "mangrove"
}

def main():
    print("Loading districts and dissolving to states...")
    districts = gpd.read_file(DISTRICTS_FILE).to_crs(epsg=4326)
    # State column might be 'stname', 'STATE', 'state_name' — detect
    state_col = next(c for c in districts.columns
                     if c.lower() in ["stname", "state", "state_name", "statename"])
    states = districts.dissolve(by=state_col).reset_index()
    states[[state_col, "geometry"]].rename(
        columns={state_col: "state"}
    ).to_file(STATES_OUT, driver="GeoJSON")
    print(f"  Wrote {STATES_OUT}")

    print(f"Generating H3 res {H3_RES} hexes covering India...")
    india_geom = states.unary_union.__geo_interface__
    hex_ids = h3.polygon_to_cells(
        h3.LatLngPoly(*[
            list(coords) for coords in india_geom["coordinates"][0]
        ]) if india_geom["type"] == "Polygon"
        else h3.LatLngMultiPoly(*[
            [list(c) for c in poly[0]] for poly in india_geom["coordinates"]
        ]),
        H3_RES,
    )
    print(f"  Generated {len(hex_ids)} hexes")

    print("Building hex GeoDataFrame...")
    hex_polys = []
    for hid in hex_ids:
        boundary = h3.cell_to_boundary(hid)
        # H3 returns (lat, lng), Shapely wants (lng, lat)
        hex_polys.append(Polygon([(lng, lat) for lat, lng in boundary]))
    hexes = gpd.GeoDataFrame({"h3_id": list(hex_ids)}, geometry=hex_polys, crs="EPSG:4326")

    # Tag each hex with its containing state (largest overlap wins)
    print("Tagging hexes with state...")
    hexes_with_state = gpd.sjoin(
        hexes, states[[state_col, "geometry"]].rename(columns={state_col: "state"}),
        how="left", predicate="intersects"
    ).drop_duplicates("h3_id")
    hexes["state"] = hexes_with_state["state"].values

    # Aggregate raster values per hex
    print("Computing elevation_mean per hex...")
    hexes["elevation_mean"] = [
        r["mean"] if r and r["mean"] is not None else None
        for r in zonal_stats(hexes, "data/raw/india_elevation.tif",
                             stats=["mean"], nodata=-9999)
    ]

    print("Computing ndvi_mean per hex...")
    hexes["ndvi_mean"] = [
        r["mean"] if r and r["mean"] is not None else None
        for r in zonal_stats(hexes, "data/raw/india_ndvi.tif",
                             stats=["mean"], nodata=-9999)
    ]

    print("Computing dominant land cover class per hex...")
    lc_results = zonal_stats(hexes, "data/raw/india_landcover.tif",
                             categorical=True, nodata=0)
    def dominant(stats):
        if not stats: return None
        cls = max(stats, key=stats.get)
        return LC_CLASSES.get(cls, f"class_{cls}")
    hexes["land_use"] = [dominant(s) for s in lc_results]

    # Round floats to keep file small
    for col in ["elevation_mean", "ndvi_mean"]:
        hexes[col] = hexes[col].round(1) if col == "elevation_mean" else hexes[col].round(3)

    print(f"Writing {HEX_OUT}...")
    Path(HEX_OUT).parent.mkdir(parents=True, exist_ok=True)
    hexes.to_file(HEX_OUT, driver="GeoJSON")
    print(f"Done. {len(hexes)} hexes with attributes.")

if __name__ == "__main__":
    main()
```

**If raw rasters are missing**, run with mock data: fill `elevation_mean`, `ndvi_mean`, `land_use` with sensible random values per hex, log a clear "MOCK MODE" warning. The frontend should still work end-to-end so the user can validate the UX.

---

## Part 2 — Frontend

### Route + dependencies

```bash
npm install react-leaflet leaflet d3-scale d3-scale-chromatic
```

Add route: `<Route path="/grid" element={<HexMap />} />`

### Page layout (`HexMap.jsx`)

- Full viewport map
- Top bar (60px tall): page title left, attribute selector center, state filter right
- Legend: floating bottom-left
- On mount: fetch `/data/india_hex_grid.geojson` and `/data/india_states.geojson`

State:
```jsx
const [attribute, setAttribute] = useState("elevation_mean");
const [selectedState, setSelectedState] = useState("All India");
```

### Map (`Map.jsx`)

- CARTO Light tiles: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`
- Center `[22.5, 80]`, zoom 5, max bounds `[[6, 68], [37, 98]]`, min/max zoom 4-10
- Render hex grid as a `<GeoJSON>` layer
- Filter features by selected state (if not "All India")
- Style each hex by current attribute:
  - `elevation_mean`: D3 `interpolateViridis`, domain `[0, 5000]`
  - `ndvi_mean`: D3 `interpolateGreens`, domain `[0, 0.8]`
  - `land_use`: discrete colors per class:
    - tree: #2d6a4f
    - shrub: #95d5b2
    - grass: #d8f3dc
    - crop: #f4d35e
    - built: #d62828
    - barren: #c9b79c
    - water: #1d4e89
    - wetland: #84a59d
    - snow: #ffffff
- Hex opacity 0.7, stroke 0.3px gray
- On click: Leaflet popup showing the three attribute values + state + h3_id

### Attribute selector (`AttributeSelector.jsx`)

Three buttons or a segmented control:
- ⛰️ Elevation
- 🌿 Vegetation (NDVI)
- 🗺️ Land use

### State filter (`StateFilter.jsx`)

Dropdown sorted alphabetically with "All India" at top. Options derived from the unique values in `india_states.geojson`. When a state is selected, the map filters hexes where `properties.state === selectedState` AND optionally fits the map view to that state's bounds.

### Legend (`Legend.jsx`)

- For continuous attributes: gradient bar with min/max labels
- For land use: list of class names with color swatches

---

## Acceptance criteria

- [ ] `/grid` route loads
- [ ] Hex grid renders over India — visible as ~13k hexagons
- [ ] Default view: hexes colored by elevation
- [ ] Toggling attribute updates colors smoothly
- [ ] Land use shows distinct colors for tree / crop / built / etc.
- [ ] State filter dropdown lists all Indian states + "All India"
- [ ] Selecting a state hides hexes outside it
- [ ] Clicking a hex shows popup with h3_id, state, all three attributes
- [ ] Legend updates with attribute selection
- [ ] No console errors
- [ ] Pipeline completes end-to-end (real or mock) without errors

---

## Out of scope (do NOT build now)

- Population layer
- Water bodies / rivers
- Soil
- Higher resolution hexes (res 6, 7)
- District-level toggle
- Risk scoring of any kind
- Hazard data
- Time / forecast
- Sub-hex drill-down
- Hex selection / highlighting beyond click popup
- Mobile-optimized layout

These come in future briefs.

---

## Rules for Claude Code

1. **Do this brief only.** Do not implement any other phase or layer.
2. **If raw rasters are missing**, use mock data with clear "MOCK MODE" logging. Don't block on real data.
3. **Don't add dependencies** beyond what's listed.
4. **Verify by running the dev server** and confirming all 8 acceptance criteria before saying done.
5. **Match the existing codebase style** for the frontend.
6. **Ask before deviating** from this spec.

---

## What the user does manually

If raw rasters aren't already in `data/raw/`, the user runs this in Google Earth Engine first (https://code.earthengine.google.com):

```javascript
var india = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'India'));
var aoi = india.geometry();
var bounds = aoi.bounds();

var dem = ee.Image('USGS/SRTMGL1_003').clip(aoi);
var ndvi = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterDate('2023-01-01', '2024-01-01')
  .select('NDVI').mean().multiply(0.0001).clip(aoi);
var lc = ee.ImageCollection('ESA/WorldCover/v200').first().clip(aoi);

[
  {img: dem,  name: 'elevation', scale: 90},   // 90m is fine for res 5 hexes
  {img: ndvi, name: 'ndvi',      scale: 250},
  {img: lc,   name: 'landcover', scale: 30}
].forEach(function(j) {
  Export.image.toDrive({
    image: j.img,
    description: 'india_' + j.name,
    folder: 'ClimResWASH',
    fileNamePrefix: 'india_' + j.name,
    region: bounds, scale: j.scale, maxPixels: 1e13
  });
});
```

Three exports, ~30-60 min wall time, dropped into `data/raw/` when done.
