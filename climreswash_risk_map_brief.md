# Claude Code Brief — Climate Risk Map page for ClimResWASH

## Before you paste this into Claude Code

**Verify these assumptions match my project first.** If anything is wrong, fix it in this brief before handing it over.

- Frontend stack: **React + Vite** (or Next.js — adapt routing accordingly)
- Map library: **react-leaflet** (swap to MapLibre or Mapbox GL if already used)
- Data pipeline: **Python 3.10+** (runs locally / as a batch job, not in the request path)
- Hosting: static GeoJSON served from `/public/data/`
- Existing GeoJSON: `india_districts.geojson` already in the repo — confirm its path and the property name for the district name (likely `dtname`, `DISTRICT`, or `NAME_2` — Claude Code should detect this)

---

## 1. What we're building

A new route `/risk-map` that visualizes a **composite climate risk score per Indian district** using the IPCC AR6 framework:

> **Risk = Hazard × Exposure × Vulnerability**

The page is the foundation for sub-district drill-down later (block → gram panchayat → hex grid). Reference inspiration: [refinq.com/weather](https://www.refinq.com/weather) — same "See the hazard → See the risk → See the priority" pattern, applied to WASH infrastructure instead of corporate assets.

### User-facing features

1. **Choropleth map of India** — districts colored by `risk` (composite, 0–1) by default
2. **Hazard selector** (top bar) — switch coloring between `risk`, `hazard`, `exposure`, `vulnerability`, or individual layers (`rainfall_mean`, `temp_max`, `ndvi_mean`, `slope_mean`, `built_frac`, `population`)
3. **Click district → right sidebar** — shows name, state, risk score, contribution breakdown (hazard/exposure/vulnerability bars), and all raw values
4. **Top-20 priority panel** (top-right, collapsible) — ranked list of highest-risk districts for the current layer; clicking one zooms the map and opens the sidebar
5. **Color legend** (bottom-left) — gradient with min/max labels, updates with selected layer
6. **Search box** (top-left) — type a district name, map flies to it and opens the sidebar
7. **Responsive** — works on desktop and tablet. Mobile is nice-to-have.

---

## 2. File layout

```
/scripts/
  build_risk_data.py            # Python pipeline (Part 4)
  requirements.txt              # Python deps
/data/raw/                      # Raw raster inputs (gitignored, see Part 4)
/public/data/
  districts_risk.geojson        # Pipeline output — frontend loads this
/src/pages/
  RiskMap.jsx                   # Page component + layout
/src/components/RiskMap/
  Map.jsx                       # Leaflet map + GeoJSON layer
  Sidebar.jsx                   # District detail panel
  RankedList.jsx                # Top-20 priority view
  HazardSelector.jsx            # Layer toggle (top bar)
  Legend.jsx                    # Color scale legend
  SearchBox.jsx                 # District search
  utils/
    colors.js                   # D3 color scales + helpers
    format.js                   # Number formatting (e.g., 1.2M for population)
```

---

## 3. Frontend build

### Step 3.1 — Add the route and install deps

```bash
npm install react-leaflet leaflet d3-scale d3-scale-chromatic
```

Add to existing router:
```jsx
<Route path="/risk-map" element={<RiskMap />} />
```

Add the Leaflet CSS import at the top of `RiskMap.jsx`:
```jsx
import "leaflet/dist/leaflet.css";
```

### Step 3.2 — Page skeleton (`RiskMap.jsx`)

Layout:
- Full viewport height, no scroll on the page itself
- Top bar (60px tall): hazard selector + search box
- Below: map fills left 70%, sidebar (collapsible) takes right 30% when open
- Floating overlays on the map: ranked list (top-right), legend (bottom-left)

Use Tailwind or whatever the existing site uses for styling.

### Step 3.3 — Map component (`Map.jsx`)

- **Base tiles**: CARTO Light (free, no API key)
  - URL: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`
  - Attribution: `© OpenStreetMap, © CARTO`
- **Center**: `[22.5, 80]` zoom `5`
- **Max bounds**: `[[6, 68], [37, 98]]` (restrict pan to India)
- **Min/max zoom**: `4`–`10`
- **Load GeoJSON**: fetch `/data/districts_risk.geojson` on mount, render with `<GeoJSON>`
- **Style function**: color polygon fill by `feature.properties[selectedLayer]`, using the D3 scale from `utils/colors.js`
- **Hover**: increase stroke weight to 2, on mouseout reset
- **Click**: bubble up the feature properties to parent → opens sidebar

```jsx
const styleFn = (feature) => ({
  fillColor: getColor(feature.properties[selectedLayer], selectedLayer),
  fillOpacity: 0.75,
  weight: 0.5,
  color: "#333",
});
```

### Step 3.4 — Color scales (`utils/colors.js`)

```js
import { scaleSequential } from "d3-scale";
import { interpolateYlOrRd, interpolateRdYlGn, interpolateViridis } from "d3-scale-chromatic";

const SCALES = {
  risk:          { interp: interpolateYlOrRd, domain: [0, 1] },
  hazard:        { interp: interpolateYlOrRd, domain: [0, 1] },
  exposure:      { interp: interpolateYlOrRd, domain: [0, 1] },
  vulnerability: { interp: interpolateYlOrRd, domain: [0, 1] },
  rainfall_mean: { interp: interpolateYlOrRd, domain: "auto" },
  temp_max:      { interp: interpolateYlOrRd, domain: "auto" },
  ndvi_mean:     { interp: t => interpolateRdYlGn(1 - t), domain: "auto" }, // reversed: low NDVI = red
  slope_mean:    { interp: interpolateViridis, domain: "auto" },
  built_frac:    { interp: interpolateYlOrRd, domain: "auto" },
  population:    { interp: interpolateYlOrRd, domain: "auto" },
};

// Compute domains from data on first load, cache
export function buildScales(features) { /* … */ }
export function getColor(value, layer) { /* … */ }
```

### Step 3.5 — Sidebar (`Sidebar.jsx`)

Right-side panel, opens on district click. Contents:
- District name (large) + state (subtitle)
- Risk score (huge number, colored by scale)
- Three horizontal bars showing hazard, exposure, vulnerability values (0–1)
- A table of raw values:
  - Rainfall (mm/yr)
  - Max temp (°C)
  - NDVI (0–1)
  - Slope (degrees)
  - Population (formatted, e.g., 2.3M)
  - Built-up fraction (%)
- Close button (X) in top-right of panel

### Step 3.6 — Hazard selector (`HazardSelector.jsx`)

Horizontal tabs or a `<select>` dropdown in the top bar. Options (in this order):
- Overall Risk *(default)*
- Hazard
- Exposure
- Vulnerability
- ─── separator ───
- Rainfall
- Max temperature
- Vegetation (NDVI)
- Slope
- Built-up area
- Population

On change → updates `selectedLayer` state in `RiskMap.jsx`, which propagates to Map, Sidebar (highlights active layer), Legend, and RankedList.

### Step 3.7 — Top-20 ranked list (`RankedList.jsx`)

Floating panel, top-right of map, collapsible (default open on desktop, closed on mobile).
- Title: "Top 20 by [layer name]"
- For each district: rank number, name, state, value (colored by scale)
- Click row → fly map to district + open sidebar

Sort: descending by current `selectedLayer`. Recompute on layer change.

### Step 3.8 — Legend (`Legend.jsx`)

Floating panel, bottom-left of map.
- Horizontal gradient bar (200px wide, 20px tall)
- Min and max labels under the bar
- Layer name above

### Step 3.9 — Search box (`SearchBox.jsx`)

Top-left of top bar. Simple fuzzy match (use `fuse.js` or just `.toLowerCase().includes()` for v1).
- Show dropdown of up to 10 matches as user types
- On select: fly map to district centroid + open sidebar

---

## 4. Data pipeline (Python)

### Step 4.1 — `scripts/requirements.txt`

```
geopandas>=0.14
rasterio>=1.3
rasterstats>=0.19
numpy>=1.24
```

### Step 4.2 — Input data (place in `/data/raw/`)

These are the rasters needed. **Don't download them in this task** — assume they're already on disk. I'll provide them. Just write the script that consumes them.

| File | Source | Notes |
|---|---|---|
| `india_districts.geojson` | Existing in repo | District polygons |
| `imd_rainfall_annual.tif` | IMD or CHIRPS | Annual rainfall, mm |
| `era5_tmax.tif` | Copernicus CDS | Max temp, °C |
| `modis_ndvi.tif` | MODIS MOD13Q1 (via GEE) | NDVI, scaled 0–1 |
| `srtm_slope.tif` | Derived from SRTM in QGIS | Slope, degrees |
| `worldpop_ind_2020.tif` | WorldPop | Population per pixel |
| `ghsl_built_2020.tif` | GHSL | Built-up fraction, 0–1 |

### Step 4.3 — `scripts/build_risk_data.py`

```python
"""
Compute composite climate risk per district via zonal statistics.
Run: python scripts/build_risk_data.py
Output: public/data/districts_risk.geojson
"""
import geopandas as gpd
from rasterstats import zonal_stats
import numpy as np

INPUT_DISTRICTS = "data/raw/india_districts.geojson"
OUTPUT = "public/data/districts_risk.geojson"

RASTERS = {
    "rainfall_mean": ("data/raw/imd_rainfall_annual.tif", "mean"),
    "temp_max":      ("data/raw/era5_tmax.tif",           "mean"),
    "ndvi_mean":     ("data/raw/modis_ndvi.tif",          "mean"),
    "slope_mean":    ("data/raw/srtm_slope.tif",          "mean"),
    "population":    ("data/raw/worldpop_ind_2020.tif",   "sum"),
    "built_frac":    ("data/raw/ghsl_built_2020.tif",     "mean"),
}

def norm(s):
    """Min-max normalize a pandas Series to 0–1, robust to NaN."""
    s = s.astype(float)
    mn, mx = s.min(), s.max()
    if mx == mn:
        return s * 0
    return (s - mn) / (mx - mn)

def main():
    print(f"Loading {INPUT_DISTRICTS}...")
    gdf = gpd.read_file(INPUT_DISTRICTS)
    if gdf.crs is None or gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    for col, (path, stat) in RASTERS.items():
        print(f"  Zonal stats: {col} ({stat}) from {path}")
        results = zonal_stats(gdf, path, stats=[stat], nodata=-9999, all_touched=True)
        gdf[col] = [r[stat] if r and r[stat] is not None else np.nan for r in results]

    # Fill NaNs with median (so districts without data don't break the score)
    for col in RASTERS:
        gdf[col] = gdf[col].fillna(gdf[col].median())

    # Composite scores — IPCC framework
    gdf["hazard"] = (
        0.4 * norm(gdf["rainfall_mean"]) +
        0.4 * norm(gdf["temp_max"]) +
        0.2 * norm(gdf["slope_mean"])           # terrain as amplifier
    )
    gdf["vulnerability"] = (
        0.5 * (1 - norm(gdf["ndvi_mean"])) +    # low green cover = high vuln
        0.5 * norm(gdf["built_frac"])           # more impervious = higher vuln
    )
    gdf["exposure"] = norm(gdf["population"])
    gdf["risk"] = norm(
        gdf["hazard"] * gdf["exposure"] * gdf["vulnerability"]
    )

    # Round to 4 decimals to keep the GeoJSON small
    for col in ["hazard", "vulnerability", "exposure", "risk"] + list(RASTERS):
        gdf[col] = gdf[col].round(4)

    print(f"Writing {OUTPUT}...")
    gdf.to_file(OUTPUT, driver="GeoJSON")
    print(f"Done. {len(gdf)} districts processed.")

if __name__ == "__main__":
    main()
```

### Step 4.4 — Run it
```bash
cd scripts
pip install -r requirements.txt
cd ..
python scripts/build_risk_data.py
```

Output appears at `/public/data/districts_risk.geojson` — the file the frontend loads.

---

## 5. Build order (do these in sequence)

1. **Verify stack** — confirm React + react-leaflet, check `package.json`, find the existing `india_districts.geojson` and identify the district-name property
2. **Create the route + page skeleton** with dummy data — get the layout rendering
3. **Build the Python pipeline** — if rasters aren't on disk yet, generate `districts_risk.geojson` with mock random values for development (so the frontend can be built in parallel)
4. **Wire real data into the map** — fetch + render the GeoJSON
5. **Color scales + legend**
6. **Click → sidebar** with district details
7. **Hazard selector** — wire the layer switching
8. **Top-20 ranked list**
9. **Search box**
10. **Polish** — responsive layout, loading states, error handling

---

## 6. Acceptance criteria

- [ ] `/risk-map` route exists and loads without errors
- [ ] India map renders with district boundaries visible
- [ ] Districts are colored by `risk` by default
- [ ] Hazard selector switches the coloring smoothly
- [ ] Clicking a district opens the sidebar with full details
- [ ] Top-20 panel shows ranked districts; clicking flies map + opens sidebar
- [ ] Search finds a district by name and flies the map there
- [ ] Legend updates with the selected attribute
- [ ] No console errors on any interaction
- [ ] First meaningful render in under 3 seconds on a decent connection
- [ ] Tablet layout works (no horizontal scroll on iPad-sized viewports)

---

## 7. Out of scope (don't build now)

- Block / gram panchayat / hex-grid drill-down (handled later by swapping the GeoJSON)
- Real-time data refresh (pipeline is batch for now)
- Future scenarios / SSPs / RCPs
- Authentication / user accounts
- Mobile-optimized layout (responsive is enough)
- Backend API — everything is static files
- Server-side rendering of the map

---

## 8. Rules for Claude Code

- **Ask before adding any dependency** not listed above
- **Don't invent data** — if a raster is missing, use mock random values and flag clearly in console
- **Match the existing codebase's style** — use the same component pattern, file naming, and styling system already present
- **Keep components small** — if a file exceeds 200 lines, split it
- **Comment the non-obvious** — especially the color scale logic and the zonal stats output schema
- **Verify after each step** — run the dev server and confirm the page loads before moving on
