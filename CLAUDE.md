# ClimResWASH — Climate-Resilient Water, Sanitation & Hygiene Platform

## What this is

India-wide climate risk assessment platform using H3 hexagonal grid (12,705 cells at ~252 km² each). Computes 10-hazard risk scores per hex using real terrain, satellite, WASH, and population data. Includes 7-day weather forecast early warning system.

## Stack

- **Frontend**: React + Vite + TypeScript + react-leaflet + h3-js + Tailwind/shadcn
- **Backend**: Express + Drizzle ORM + PostgreSQL (Replit)
- **Risk engine**: Pure Python (scripts/risk/formulas.py) — no NumPy dependency
- **Data pipeline**: Python scripts in scripts/ folder

## Key pages

| Route | File | Description |
|-------|------|-------------|
| `/grid` | HexMapPage.tsx | Main hex grid map with 22 layers, collapsible sidebar |
| `/forecast` | ForecastPage.tsx | 7-day early warning with hazard filters |
| `/report/:district` | ReportPage.tsx | Print-friendly district risk profile |
| `/risk-map` | RiskMapPage.tsx | District-level IPCC AR6 choropleth |
| `/dashboard` | Dashboard.tsx | Legacy dashboard with hex grid data banner |
| `/adapt` | AdaptPage.tsx | Adaptation planner |

## Data files (client/public/data/)

| File | Size | Source | What |
|------|------|--------|------|
| `india_hex_props.json` | 6.8MB | Generated | All hex properties (no geometry — h3-js reconstructs) |
| `india_hex_grid.geojson` | 10MB | Generated | Full GeoJSON (used by scripts, not by frontend) |
| `forecast_risk.json` | ~1.7MB | compute_forecast.py | 7-day per-hex risk forecast |
| `india.json` | ~4MB | Original | 735 district polygons with HAZARD/EXPOSURE/VULNERABILITY |
| `hex_states/*.json` | ~200KB each | Generated | Per-state hex props for lazy loading |

## Risk formulas (scripts/risk/)

`formulas.py` — 11 pure functions implementing the formula book:
- `pluvial_flood_score`, `heatwave_score`, `drought_score`, `wet_bulb_score`, `cyclone_score`
- `exposure_score`, `flood_sensitivity`, `heat_sensitivity`, `adaptive_capacity`
- `compute_risk` — master formula with AC dampening: `max(0.2, 1 - H/12)`

`cascades.py` — 10 WASH cascade rules (compound risk amplifiers with action recommendations)

Tests: `tests/test_formulas.py` — 16 tests, all passing

## Data pipeline scripts (scripts/)

Run in this order to rebuild from scratch:
```bash
python scripts/build_hex_grid.py          # Generate H3 hexes from india.json (mock if no rasters)
python scripts/fetch_elevation.py         # Real SRTM 90m via opentopodata.org
python scripts/fetch_ndvi.py              # Real MODIS NDVI via ORNL DAAC
python scripts/fetch_landuse.py           # Real ESA WorldCover 2021 via S3 COG
python scripts/compute_slope_water.py     # Real slope from H3 neighbors + dist to water
python scripts/join_hex_districts.py      # Spatial join + NFHS-5 WASH + risk computation
python scripts/compute_forecast.py        # 7-day weather forecast → per-hex risk
```

## Real data sources

| Data | Source | API/Method |
|------|--------|-----------|
| Elevation | SRTM 90m | opentopodata.org (free, no key) |
| NDVI | MODIS MOD13Q1 2023 | ORNL DAAC REST API (free, no key) |
| Land Use | ESA WorldCover 2021 | S3 Cloud Optimized GeoTIFF (free) |
| WASH indicators | NFHS-5 | DHS Program API (free, state-level) |
| Poverty (MPI) | NITI Aayog 2021 | Hardcoded in nfhs5_poverty_mpi.json |
| Population | Census 2011 | State totals distributed by land-use weight |
| Slope | Computed | H3 neighbor elevation differences |
| Distance to water | Computed | Haversine to nearest ESA "water" hex |
| Weather forecast | Open-Meteo | ECMWF/GFS models (free, no key) |

## Backtest validation

5 real disasters tested (scripts/backtest_events.py), all pass:
- Mumbai Floods 2005: 7.06/10
- Kerala Floods 2018: 5.25/10
- Cyclone Amphan 2020: 3.83 (Kolkata) / 6.93 (Sundarbans)
- Marathwada Drought 2016: 6.76/10
- Delhi Heatwave 2023: 6.88/10

## Key architectural decisions

- **H3 hexagons over districts**: Equal-area cells allow fair comparison; independent of admin boundaries
- **h3-js client reconstruction**: Frontend loads props-only JSON (6.8MB), reconstructs hex polygons from h3_id — 35% smaller than GeoJSON
- **Canvas renderer**: Leaflet canvas mode for 12,705 features instead of SVG
- **Fixed absolute color scales**: Risk 0-10 always maps green→red regardless of zoom level
- **AC dampening at extreme hazard**: `max(0.2, 1-H/12)` prevents high-AC areas from scoring near-zero during genuine disasters
- **Cascade amplifiers**: Compound WASH rules add to risk when multiple bad conditions combine

## Development

```bash
npm run dev              # Start dev server (needs DATABASE_URL)
npx vite dev --port 5000 # Frontend only (no DB needed)
npx tsc --noEmit         # Type check
python -m pytest tests/  # Formula tests
```

## Refresh forecast

```bash
python scripts/compute_forecast.py    # or
bash scripts/refresh_forecast.sh      # wrapper for cron
```
