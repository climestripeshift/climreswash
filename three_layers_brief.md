# Claude Code Brief — Three Foundational Layers (Green / Mountain / Water)

Goal: add three toggleable map layers to ClimResWASH as the **first layer stack** on top of the existing admin district map. This is the foundation — hazards, scoring, and forecasts come later.

---

## Stack assumptions (verify before starting)

- Frontend: **React + Vite** (check `package.json`; adapt if Next.js)
- Map library: **react-leaflet** (install if missing)
- Data pipeline: **Python 3.10+**
- Existing file: `india_districts.geojson` already in the repo — confirm its path and identify the district-name field (likely `dtname`, `DISTRICT`, or `NAME_2`)

---

## What we're building

A new page at `/layers` (or add to existing map page if there is one) with:

1. **Base map of India** — admin district boundaries already loaded
2. **Layer toggle panel** (top-right, collapsible) with three checkboxes:
   - [ ] Green cover — colors districts by NDVI (white → green)
   - [ ] Mountain — highlights mountainous districts (single fill color, e.g., brown)
   - [ ] Water bodies — draws actual rivers and lakes as blue vector lines/polygons on top
3. **Legend** (bottom-left) — updates based on which layers are active
4. **Click a district** — small popup showing the values for active layers (NDVI, elevation, slope, water %)

Layers stack visually: green-cover choropleth at the bottom, mountain highlight on top of that, water vectors on top of everything.

---

## File layout

```
/scripts/
  gee_three_layers.js              # Earth Engine script (for documentation, run manually in GEE)
  build_three_layers.py            # Python pipeline
  requirements.txt
/data/raw/                         # Raw GeoTIFFs from GEE + OSM vectors (gitignored)
  india_ndvi.tif
  india_elevation.tif
  india_slope.tif
  india_water.tif
  india_rivers.geojson
  india_lakes.geojson
/public/data/
  districts_three_layers.geojson   # Enriched admin districts (output)
  india_rivers.geojson             # Copied here for frontend access
  india_lakes.geojson              # Copied here for frontend access
/src/pages/
  LayersMap.jsx                    # New page
/src/components/LayersMap/
  Map.jsx                          # Leaflet map with all three layers
  LayerToggle.jsx                  # The 3-checkbox panel
  Legend.jsx                       # Updates with active layers
  utils/colors.js                  # Color scales for NDVI
```

---

## Part 1: Data pipeline (USER runs the GEE part manually)

### 1.1 — Save the GEE script in the repo for reproducibility

Create `scripts/gee_three_layers.js` with this exact content (do not modify — this is what the user runs in the GEE web editor):

```javascript
// Run at https://code.earthengine.google.com/
// Outputs 4 GeoTIFFs to Drive/ClimResWASH/

var india = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'India'));
var aoi = india.geometry();
var bounds = aoi.bounds();

// 1. NDVI (annual mean, MODIS 2023)
var ndvi = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterDate('2023-01-01', '2024-01-01')
  .select('NDVI').mean()
  .multiply(0.0001)
  .clip(aoi);

// 2. Elevation + slope (SRTM)
var dem   = ee.Image('USGS/SRTMGL1_003').clip(aoi);
var slope = ee.Terrain.slope(dem);

// 3. Surface water (JRC)
var water = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .clip(aoi);

// Preview
Map.centerObject(aoi, 5);
Map.addLayer(ndvi,  {min: 0, max: 0.8, palette: ['white','green']}, 'NDVI');
Map.addLayer(dem,   {min: 0, max: 5000, palette: ['white','tan','brown']}, 'Elevation');
Map.addLayer(water, {min: 0, max: 100, palette: ['white','blue']}, 'Water');

// Export
[
  {img: ndvi,  name: 'ndvi',      scale: 250},
  {img: dem,   name: 'elevation', scale: 30},
  {img: slope, name: 'slope',     scale: 30},
  {img: water, name: 'water',     scale: 30}
].forEach(function(j) {
  Export.image.toDrive({
    image: j.img,
    description: 'india_' + j.name,
    folder: 'ClimResWASH',
    fileNamePrefix: 'india_' + j.name,
    region: bounds,
    scale: j.scale,
    maxPixels: 1e13
  });
});
```

### 1.2 — Add a README note for the user

Create `scripts/README.md`:

```markdown
# Data pipeline

## Step 1 — Run the Earth Engine script (manual, one-time)

1. Open https://code.earthengine.google.com
2. Paste contents of `gee_three_layers.js`
3. Click Run, then go to Tasks tab and click Run on each export
4. Wait 30 min to 2 hours; files appear in your Google Drive under `ClimResWASH/`
5. Download all 4 GeoTIFFs into `data/raw/`

## Step 2 — Get OSM water vectors

Option A (slow but simple):
    pip install osmnx
    python -c "import osmnx as ox; \
      ox.features_from_place('India', {'waterway':'river'}).to_file('data/raw/india_rivers.geojson', driver='GeoJSON'); \
      ox.features_from_place('India', {'natural':'water'}).to_file('data/raw/india_lakes.geojson', driver='GeoJSON')"

Option B (faster, recommended): download India OSM extract from
https://download.geofabrik.de/asia/india.html and filter with osmium or QGIS.

## Step 3 — Run the Python pipeline

    pip install -r requirements.txt
    python build_three_layers.py
```

### 1.3 — Python pipeline

Create `scripts/requirements.txt`:
```
geopandas>=0.14
rasterio>=1.3
rasterstats>=0.19
shapely>=2.0
```

Create `scripts/build_three_layers.py`:

```python
"""
Enrich admin districts with three foundational layers:
green cover (NDVI), mountain (elevation + slope), water (water %).
Also copy OSM water vectors to /public/data/ for frontend access.

Run: python scripts/build_three_layers.py
"""
import geopandas as gpd
from rasterstats import zonal_stats
import shutil
import os

DISTRICTS_IN  = "data/raw/india_districts.geojson"
OUT_DISTRICTS = "public/data/districts_three_layers.geojson"
OUT_RIVERS    = "public/data/india_rivers.geojson"
OUT_LAKES     = "public/data/india_lakes.geojson"

RASTERS = [
    ("ndvi_mean",      "data/raw/india_ndvi.tif",      "mean"),
    ("elevation_mean", "data/raw/india_elevation.tif", "mean"),
    ("slope_mean",     "data/raw/india_slope.tif",     "mean"),
    ("water_pct",      "data/raw/india_water.tif",     "mean"),
]

def main():
    os.makedirs("public/data", exist_ok=True)

    print(f"Loading {DISTRICTS_IN}...")
    gdf = gpd.read_file(DISTRICTS_IN)
    if gdf.crs is None or gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    for col, path, stat in RASTERS:
        print(f"  Zonal stats: {col} from {path}")
        results = zonal_stats(gdf, path, stats=[stat], nodata=-9999, all_touched=True)
        gdf[col] = [r[stat] if r and r[stat] is not None else None for r in results]

    for col, _, _ in RASTERS:
        gdf[col] = gdf[col].fillna(gdf[col].median())

    # Layer flags
    gdf["is_green"]    = gdf["ndvi_mean"] > 0.4
    gdf["is_mountain"] = (gdf["elevation_mean"] > 1500) | (gdf["slope_mean"] > 15)
    gdf["has_water"]   = gdf["water_pct"] > 2

    # Round numerics for smaller file
    for col, _, _ in RASTERS:
        gdf[col] = gdf[col].round(3)

    print(f"Writing {OUT_DISTRICTS}...")
    gdf.to_file(OUT_DISTRICTS, driver="GeoJSON")

    # Copy OSM vectors to public/data/ for frontend
    for src, dst in [("data/raw/india_rivers.geojson", OUT_RIVERS),
                     ("data/raw/india_lakes.geojson",  OUT_LAKES)]:
        if os.path.exists(src):
            shutil.copy(src, dst)
            print(f"Copied {src} -> {dst}")
        else:
            print(f"WARN: {src} not found, skipping. Run the OSM step from README.")

    print(f"Done. {len(gdf)} districts processed.")

if __name__ == "__main__":
    main()
```

---

## Part 2: Frontend

### 2.1 — Install deps

```bash
npm install react-leaflet leaflet d3-scale d3-scale-chromatic
```

Add `import "leaflet/dist/leaflet.css"` to `LayersMap.jsx`.

### 2.2 — Add route

```jsx
<Route path="/layers" element={<LayersMap />} />
```

### 2.3 — Page layout (`LayersMap.jsx`)

- Full viewport height
- Map fills the screen
- Top bar (optional) with page title
- Layer toggle panel: floating, top-right, collapsible
- Legend: floating, bottom-left
- All three data files fetched on mount:
  - `/data/districts_three_layers.geojson`
  - `/data/india_rivers.geojson`
  - `/data/india_lakes.geojson`

### 2.4 — Map setup (`Map.jsx`)

- Base tiles: CARTO Light `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` (no API key)
- Center: `[22.5, 80]` zoom `5`
- Max bounds: `[[6, 68], [37, 98]]`
- Min/max zoom: `4`–`10`

Three GeoJSON layers, rendered in this order (bottom to top):

**Layer 1: Green cover** (only rendered when `showGreen === true`)
- Source: `districts_three_layers.geojson`
- Style: fill color from D3 `interpolateGreens` scale based on `ndvi_mean` (domain 0 to 0.8)
- Fill opacity: 0.7
- Stroke: 0.5px gray

**Layer 2: Mountain highlight** (only rendered when `showMountain === true`)
- Source: same GeoJSON, filtered to features where `is_mountain === true`
- Style: solid brown fill (#8B6F47), opacity 0.5
- Stroke: 0.5px darker brown

**Layer 3: Water bodies** (only rendered when `showWater === true`)
- Two sources combined:
  - `india_rivers.geojson` — render as blue lines, weight 1.2, opacity 0.8, color `#1e6091`
  - `india_lakes.geojson` — render as blue polygons, fill `#4a90c2`, opacity 0.6
- No stroke on lakes

**Click handler** (on the district layer underneath):
- Open Leaflet popup at click location
- Show: district name + values for whichever layers are active
  - If green active: "NDVI: 0.42"
  - If mountain active: "Elevation: 1820m, Slope: 18°, Mountainous: yes"
  - If water active: "Water surface: 3.2%"

### 2.5 — Layer toggle panel (`LayerToggle.jsx`)

```jsx
function LayerToggle({ layers, onChange }) {
  return (
    <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000]">
      <h3 className="font-semibold mb-2">Layers</h3>
      <label className="block">
        <input type="checkbox" checked={layers.green}
          onChange={e => onChange({ ...layers, green: e.target.checked })} />
        <span className="ml-2">🌿 Green cover</span>
      </label>
      <label className="block">
        <input type="checkbox" checked={layers.mountain}
          onChange={e => onChange({ ...layers, mountain: e.target.checked })} />
        <span className="ml-2">⛰️ Mountains</span>
      </label>
      <label className="block">
        <input type="checkbox" checked={layers.water}
          onChange={e => onChange({ ...layers, water: e.target.checked })} />
        <span className="ml-2">💧 Water bodies</span>
      </label>
    </div>
  );
}
```

State lives in `LayersMap.jsx`:
```jsx
const [layers, setLayers] = useState({ green: true, mountain: false, water: false });
```

### 2.6 — Legend (`Legend.jsx`)

Bottom-left floating panel. Shows entries for whichever layers are active:
- Green: horizontal gradient bar (white → green), labels "Low NDVI" and "High NDVI"
- Mountain: brown square + "Mountainous district"
- Water: blue line + "River", blue square + "Lake"

---

## Part 3: Build order

1. Confirm stack and locate `india_districts.geojson` and its district-name field
2. Create `scripts/` directory with the GEE script + README + Python pipeline + requirements
3. Add the route and page skeleton with dummy GeoJSONs (generate one if real files not ready, so frontend can be built in parallel)
4. Implement the layer toggle and base map
5. Add the green cover choropleth
6. Add the mountain highlight
7. Add the water vectors
8. Add the click popup
9. Add the legend
10. Test all 8 combinations of layer toggles

---

## Acceptance criteria

- [ ] `/layers` route exists and loads
- [ ] Base map of India renders with district boundaries
- [ ] Three checkboxes work independently — any combination renders correctly
- [ ] Green cover shows a clear NDVI gradient across districts
- [ ] Mountain highlight covers expected districts (Himalayan belt, Western Ghats, parts of NE India)
- [ ] Water bodies show major rivers (Ganga, Brahmaputra, Krishna, etc.) and lakes
- [ ] Clicking any district opens a popup with values for active layers
- [ ] Legend updates when layers are toggled
- [ ] Python pipeline runs end-to-end without errors when raw data is in place
- [ ] No console errors

---

## Out of scope

- Risk scoring or composite indices
- Hazard layers (rainfall, temperature, etc.)
- Sub-district drill-down
- Real-time data
- Mobile layout (responsive is enough)
- Authentication

---

## Rules for Claude Code

- **Do not run the GEE script** — that's manual, the user does it. Just save it in the repo.
- **If raw GeoTIFFs aren't present**, generate small mock GeoJSON files with random NDVI/elevation/slope/water values so the frontend can be built and tested. Clearly mark these as mocks in console output.
- **Match the existing codebase style** — same component patterns, file naming, styling system already in use.
- **Don't add dependencies** beyond what's listed without asking.
- **Verify after each step** — run the dev server and confirm before moving on.
