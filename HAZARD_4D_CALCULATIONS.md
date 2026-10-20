# Hazard 4-D layers: calculation reference and audit guide

Created 19 October 2026. Covers the seven 4-D hazard layers served at `/4d`:
heat wave, flood, drought, wet-bulb (humid heat), landslide, flash flood and cold wave.

**Purpose.** Every number on the 4-D maps can be traced here: where each input comes from, how each factor is calculated, which constants are sourced and which are assumptions, a worked example per hazard, what was verified, and what is known to be wrong or weak. Read it with the code open; each section names the function and its constants (line numbers are as of 19 October 2026 and will drift).

**What the 4-D maps are.** For every one of the 12,705 H3 hexes (resolution 5, about 252 km²) and every calendar month, a hazard score from 0 to 10, for the 1991–2020 baseline and for four IPCC scenarios (SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5) at three horizons (2030, 2050, 2080). The dimensions are place (x, y), score (z, column height) and time (month of the year). The scenario and horizon are filters.

**What they are not.** They are *hazard* scores only (no exposure, sensitivity or adaptive capacity), built from monthly climatology, not forecasts, not daily extremes, and not calibrated against observed events. Several constants are engineering assumptions. Section 6 lists them all with IDs (A1–A17), and section 7 lists known data defects (D1–D8).

> Audit: an independent audit of this document and the code was done on 20 October 2026 (`reports/hazard_4d_audit_2026-10-20.md`); the fixes and the points I disagree with are in `reports/hazard_4d_audit_response_2026-10-20.md`. This document describes the state **after** those fixes.
>
> Status: all code is local and uncommitted. The legacy hazard engine (`hex_risk.py`) is being rebuilt separately; the 4-D layers do not feed the risk scores and are independent of that rebuild except for the shared heat threshold (section 5).

---

## 1. Contents

1. Contents
2. Pipeline and file map
3. Mechanics shared by all layers
4. Hazard-by-hazard calculations (4.1 heat, 4.2 flood, 4.3 drought, 4.4 wet-bulb, 4.5 landslide, 4.6 flash flood, 4.7 cold wave)
   - 4.8 Exposure counts and the stress comparison; 4.9 Alignment with DRR practice
5. Changes to shared engine components
6. Assumption register
7. Data defects and gaps
8. Verification performed, and what was not verified
9. Reproducing the layers from scratch
10. Audit checklist and improvement backlog
11. Formula quick reference

---

## 2. Pipeline and file map

```
Copernicus ERA5 (CDS)  ──fetch_*.py──▶  data/raw/…/*.nc
hex properties (props.json, geojson) ─┐
                                      ├──compute_*_4d.py──▶ client/public/data/<hazard>_4d/*.json
scripts/risk/formulas.py  (pure formulas) ─┤                              │
scripts/risk/scenarios.py (warming table) ─┘                              ▼
scripts/hazard_4d_common.py (sampling, bands, aggregates, file writer)   client/src/pages/Hazard4DPage.tsx  →  /4d
```

| Layer | Tab | Month on the slider means | Compute script | Formula (formulas.py) | Output folder |
|---|---|---|---|---|---|
| Heat wave | Heat | Hot afternoon of that month | `compute_heat_4d.py` | `heatwave_score`, `heat_threshold_smooth` | `heat_4d/` |
| Flood | Flood | That month's heavy-rain and river-flood potential | `compute_flood_4d.py` | `flood_hazard_seasonal` | `flood_4d/` |
| Drought | Drought | 3-month rainfall window ending that month (Aug = Jun–Aug) | `compute_drought_4d.py` | `drought_hazard_seasonal` | `drought_4d/` |
| Wet-bulb | Wet-bulb | Hottest humid afternoon of that month | `compute_wetbulb_4d.py` | `wet_bulb_hazard_seasonal` | `wetbulb_4d/` |
| Landslide | Landslide | That month's rain-triggered slope failure potential | `compute_rain_hazards_4d.py` | `landslide_hazard_seasonal` | `landslide_4d/` |
| Flash flood | Flash flood | That month's rain-triggered flash-flood potential | `compute_rain_hazards_4d.py` | `flash_flood_hazard_seasonal` | `flashflood_4d/` |
| Cold wave | Cold wave | Cold night of that month | `compute_coldwave_4d.py` | `coldwave_hazard_seasonal`, `cold_threshold_smooth` | `coldwave_4d/` |

Fetch scripts (all free, ERA5 monthly means 1991–2020 over India, area 6–38°N, 68–98°E):

| Script | Output (data/raw/…) | Variable and hours | Used by |
|---|---|---|---|
| `fetch_monthly_temp_climatology.py` | `era5_monthly_temp/era5_t2m_afternoon_1991_2020.nc` (31 MB) | 2 m temperature at 06, 09, 12 UTC | heat, wet-bulb |
| `fetch_monthly_dewpoint_climatology.py` | `era5_monthly_temp/era5_d2m_afternoon_1991_2020.nc` (31 MB) | 2 m dewpoint at 06, 09, 12 UTC | wet-bulb |
| `fetch_monthly_tmin_climatology.py` | `era5_monthly_temp/era5_t2m_dawn_1991_2020.nc` (10 MB) | 2 m temperature at 00 UTC | cold wave |
| `fetch_monthly_precip_climatology.py` | `era5_monthly_precip/era5_tp_1991_2020.nc` (10 MB) | total precipitation, monthly mean | flood, drought, landslide, flash flood |

06, 09, 12 UTC are 11:30, 14:30, 17:30 IST; 00 UTC is 05:30 IST (about sunrise).

Hex inputs come from `client/public/data/india_hex_props.json` and `india_hex_grid.geojson` (built by `build_base_layers.py`, `build_flood_inputs.py` and the other base-layer scripts; see `BASE_LAYERS.md`). The shared hex resolution of terrain, cover and soil inputs is `resolve_static_hex_inputs()` in `scripts/risk/hex_risk.py`.

---

## 3. Mechanics shared by all layers

### 3.1 From climate grid to hex (sampling)

ERA5 is a 0.25° grid. At 25°N one grid cell is about 28 × 25 km, roughly **700 km²**, while an H3 resolution-5 hex is about 252 km² (mean 258 km²), so **a hex is about one third of an ERA5 cell and several neighbouring hexes share the same coarse climate information**. Each climatology field is read at the hex centroid by bilinear interpolation between the four surrounding grid points (`sample_bilinear` in `hazard_4d_common.py`); interpolation smooths between grid points, it does not add independent climate observations inside a hex. The finer terrain and cover sampling (343 sub-cells per hex) does not raise the climate resolution. Terrain and land-cover inputs are the hex statistics already stored in the props (means or percentiles over 343 sub-cells per hex, see `BASE_LAYERS.md`).

### 3.2 Time axis

"Month" is the calendar month of the 1991–2020 climatology (mean over 30 years of each calendar month). It is a climatological season, not a particular year. Drought is the exception: month *m* is the 3-month window ending in *m*.

### 3.3 Scenarios (`scripts/risk/scenarios.py`, re-derived by `tests/test_scenarios.py`)

Warming is one table, the same for every hex and every month, **derived in code from published numbers** (revised 20 October 2026 after the audit; previously hard-coded).

1. **Source rows.** IPCC AR6 WG1 SPM, Table SPM.1, best estimate of the change in global mean surface temperature (GSAT), °C vs 1850–1900:

   | Scenario | 2021–2040 (label 2030) | 2041–2060 (label 2050) | 2081–2100 (label 2080) |
   |---|---:|---:|---:|
   | SSP1-2.6 | 1.5 | 1.7 | 1.8 |
   | SSP2-4.5 | 1.5 | 2.0 | 2.7 |
   | SSP3-7.0 | 1.5 | 2.1 | 3.6 |
   | SSP5-8.5 | 1.6 | 2.4 | 4.4 |

2. **Baseline shift to 1991–2020.** AR6 gives 0.85 °C for 1995–2014 (Table SPM.1 note) and 0.99 °C for 2001–2020 (SPM A.1.2). Linear interpolation to the midpoint of 1991–2020 (2005.5) gives 0.85 + (0.99 − 0.85)/6 = **0.87 °C**.
3. **Mean warming** vs 1991–2020 = GSAT − 0.87 (`mean_warming()`), used by flood, drought, wet-bulb, landslide, flash flood and cold wave.
4. **Hot-extreme warming** = 1.2 × mean warming, rounded to 0.1 °C (`WARMING`), used by heat only. The 1.2 factor is an assumption (A2); AR6 Chapter 11 says only that hot extremes warm faster than the mean.

| Scenario | Mean 2030 / 2050 / 2080 | Hot-extreme 2030 / 2050 / 2080 |
|---|---|---|
| SSP1-2.6 | 0.63 / 0.83 / 0.93 | 0.8 / 1.0 / 1.1 |
| SSP2-4.5 | 0.63 / 1.13 / 1.83 | 0.8 / 1.4 / 2.2 |
| SSP3-7.0 | 0.63 / 1.23 / 2.73 | 0.8 / 1.5 / 3.3 |
| SSP5-8.5 | 0.73 / 1.53 / 3.53 | 0.9 / 1.8 / 4.2 |

Limits: India's mean warming is assumed equal to the global mean (no regional amplification or damping, A1); no model spread; same value in every hex and month. The values are 0.1–0.3 °C higher than the first version of this table (which used an unstated offset of about 1.0 °C), a change within the uncertainty but visible in every scenario map.

### 3.4 Score scale and soft cap

All scores are 0–10. Several raw scores can exceed 10. Rather than clipping at 10 (which makes hexes tie and removes ranking under strong warming), scores are passed through a **soft cap** (`_soft_cap`, knee 8, cap 10):

```text
soft_cap(x) = x                                  if x <= 8
            = 8 + 2 * (1 - exp(-(x - 8) / 2))     if x > 8        (continuous, increasing, tends to 10)
```

Examples: 8 → 8.00; 9 → 8.79; 10 → 9.26; 12 → 9.72. The legacy engine used a hard clip; that is retained only in the old functions (section 5).

### 3.5 Status bands and "high"

Bands (`BANDS` in `hazard_4d_common.py`): score < 0.5 *none*; < 2.5 *low*; < 5 *moderate*; < 7.5 *high*; otherwise *extreme*. "High or extreme" means score ≥ 5. These bands are generic and were not tuned per hazard, so the share of people "in high or extreme" is not comparable across hazards (a score of 5 means different things).

### 3.6 Aggregates (the summary line and monthly bars)

For each scenario file, `index.json` stores for India and for each state: the population-weighted mean score for each month; the percentage of hexes and of population with score ≥ 5 each month; and a "hottest_month" block (the key name is shared by every hazard; it means each hex's own worst month). The hottest-month block takes **each hex's maximum over the 12 months first, then** the population-weighted mean and the share ≥ 5. (An earlier version took the maximum of the 12 national monthly means, which is a different quantity; fixed 19 October.) Since 20 October each block also carries **absolute counts** (section 4.8): `people_high`, `people_medium_or_above`, `children_u5_high`, `children_u5_medium_or_above` for the worst-month case, monthly arrays `people_high` and `children_u5_high`, and in `coverage` the totals `pop_total`, `pop_covered` and `children_u5_covered`. Population is `population` from the hex props (WorldPop 2020); hexes without population get equal weight only if the whole group has zero population. **Hexes with no estimate (score −1, section 3.7) are excluded from every aggregate**, and each aggregate block carries `coverage` (the share of hexes and of population that have an estimate); `index.json` also carries a top-level `coverage`. The page shows the covered share of people when it is below 100 %.

### 3.7 File format

`{scenario}_{horizon}.json` holds `{"score": [[12 integers] per hex]}` in the order of `index.json → h3_ids`. Integers are **tenths of a point**, rounded (`round(score * 10)`), so the resolution is 0.1. **−1 means "no estimate"** (an input is missing, for example no recorded heavy-rain days); every month of such a hex is −1, the page draws it grey and excludes it from summaries. 13 files per hazard (baseline + 4 scenarios × 3 horizons) plus `index.json`.

**Rounding and ties.** The soft cap preserves ordering, but rounding to 0.1 creates ties and exact 10.0 values (for example 837 cold-wave hexes have a stored 10.0 in some month at baseline and 752 under SSP5-8.5 2080); do not read rank differences below 0.1.

---

## 4. Hazard-by-hazard calculations

Constants are labelled **[S]** sourced from an official criterion or standard, **[D]** derived by a stated calculation, or **[A]** an engineering assumption (uncalibrated). Worked examples are real hexes computed by the code on 19 October 2026.

### 4.1 Heat wave (`heatwave_score`)

**Question answered.** How severe is a heat wave on a hot afternoon of this month in this place?

**Inputs.**
- Monthly mean 2 m temperature at 06/09/12 UTC (ERA5); the hottest of the three hours per month and cell is the monthly "afternoon maximum" T_m (proxy for the daily maximum; A4).
- Hex: `elevation_mean`, `dist_coast_m`, `lc_built_pct`, `lc_tree_pct`, `dist_water_m`, `dist_to_river_km`.

**Steps** (`compute_heat_4d.py`, `formulas.py:69`).

1. Hot-spell temperature: `T_hot = T_m + 4.5` [A, see Constants]. IMD declares a heat wave at 4.5 °C or more above the normal maximum (severe at 6.5 °C); the layer adds that departure to every hex's monthly maximum.
2. Threshold, smooth in elevation (`heat_threshold_smooth`, [S]+[A]): base = 37 °C if the hex is within 50 km of the coast, else 40 °C (IMD plains and coastal criteria). It blends linearly to 30 °C (IMD hill criterion) between 500 m and 1,500 m:
   `w = clip((elev − 500) / 1000, 0, 1);  threshold = base × (1 − w) + 30 × w`.
3. Water proximity: `dist_w = min(dist_to_river_km × 1000, dist_water_m)`.
4. Severity (`heatwave_score(t_max, threshold, days, built, tree, dist_w, warming)`):
   ```text
   warming = max(0, warming_c)                           # scenario hot-extreme warming (3.3)
   excess  = max(0, T_hot + warming − threshold)
   days    = min(3 × (1 + 0.15 × warming), 5)            # spell length 3 days [A5], grows 15 %/°C [A5]
   base    = (excess / 8) × (days / 5) × 10
   urban   = 1 + 0.3 × built/100                          # urban heat island
   veg     = 1 − 0.2 × tree/100                           # vegetation cooling
   water   = 1 − 0.1 × exp(−dist_w / 3000)                # water cooling
   score   = soft_cap(base × urban × veg × water)
   ```
   The shape of `base`, `urban`, `veg` and `water` is the original formula-book heat formula (§2); the 8 °C scale and the 5-day cap are from it.

**Constants.** 4.5 °C IMD departure **used as a fixed hot-day uplift** [A: the IMD figure is a classification threshold for declaring a heat wave, [S]; applying it as a universal estimate of the month's extreme, its frequency or return period is an uncalibrated modelling assumption, A3]; thresholds 40/37/30 °C [S, IMD classification]; blend zone 500–1,500 m [A6]; spell length 3 days [A5]; spell growth 0.15 per °C [A5]; 8 °C scale, 5-day cap, 0.3 / 0.2 / 0.1 and 3,000 m modifier weights [legacy formula book]; knee 8 [A7].

**Scenario handling.** `warming` is the hot-extreme warming (3.3): it raises the excess and lengthens the spell. The threshold is fixed (it is a physiological/IMD criterion, not a climatology).

**Worked example.** Delhi hex `853da117fffffff`, May, baseline: ERA5 afternoon maximum 39.47 °C; elevation 220 m, coast 828 km → threshold 40.0 °C; built 53.4 %, tree 35.9 %, distance to water 3,100 m.
`T_hot = 43.97`, `excess = 3.97`, `base = 3.97/8 × 3/5 × 10 = 2.98`, `urban 1.160`, `veg 0.928`, `water 0.964` → `2.98 × 1.160 × 0.928 × 0.964 = 3.09` (stored 3.1). Under SSP5-8.5 2050 (+1.8 °C hot-extreme warming): excess 5.77, days 3.81, score 5.71.

**Sanity checks.** ERA5 afternoon maxima match IMD May normals closely (Delhi about 39.5 °C, Nagpur about 42 °C). May baseline scores: Delhi 3.1, Nagpur 5.1, Jaisalmer 4.3, Mumbai 0, Shimla 0. The score reproduces the legacy backtest value for the 44 °C / 3-day scenario (Nagpur-like hex 3.0).

**Reading the score.** It is a **conditional proxy severity**: the severity of a heat wave *if* a typical IMD-criterion hot spell occurs in that month. It is not an observed heat-wave frequency or return-period hazard.

**Limits.** Monthly climatology understates daily extremes (the +4.5 °C stands in for them); same uplift everywhere (a per-hex 95th-percentile would be better); humid heat is not included (wet-bulb layer); no heat-wave frequency or spell data. The Excess Heat Factor (`excess_heat_factor`, `ehf_score` in `formulas.py`; Nairn and Fawcett 2015) is **implemented and unit-tested but not used by any layer** because it needs daily temperatures and a per-hex 95th-percentile climatology.

**Improvement options.** Daily ERA5 to compute per-hex T95 and EHF; per-hex CMIP6 temperature deltas; month-specific warming.

---

### 4.2 Flood (`flood_hazard_seasonal`)

**Question answered.** How large is the flood hazard in this place in this month: ponding rain and river flooding.

**Inputs.**
- ERA5 monthly precipitation (seasonality): `share_m = P_m / max_month(P)` (0–1) and the monthly share of annual rain.
- `flood_days_per_year` (geojson): days per year with more than 50 mm of rain (CHIRPS 1991–2020). Spread over the months in proportion to monthly precipitation: `heavy_days_m = flood_days × P_m / Σ P`.
- `rain_rp10_mm` (props): the hex's 1-in-10-year 24 h rainfall (Gumbel fit to CHIRPS 2000–2023 annual maxima).
- `flat_pct` (share of the hex that is flat, slope < 2°, from 343 DEM samples), `lc_built_pct`, sand % (SoilGrids via `resolve_static_hex_inputs`), `floodplain_pct` (share of land samples within 5 m above the nearest OSM main river).

**Steps** (`compute_flood_4d.py`, `formulas.py:192`).

```text
intensify  = 1 + 0.07 × mean_warming                      # Clausius–Clapeyron, 7 %/°C [S, AR6]
base       = IMD_table(rp10 × intensify)                   # 0 mm→0, 7.5→2, 35.5→4, 64.5→6, 124.5→8, 244.4→10, linear between, flat above 244.4 [S]
modifier   = 0.5 + 0.5×flat + 0.3×built + 0.2×(1 − sand)   # each as a 0–1 share; range 0.5–1.5 [A8]
severity   = base × modifier
occurrence = 1 − exp(−heavy_days_m × intensify / 1.0)       # 1 day/month reference [A8]
pluvial    = severity × occurrence
riverine   = (floodplain_pct / 10) × share_m × intensify
score      = soft_cap( max(pluvial, riverine) )
```

`max(pluvial, riverine)` follows the v2 design in `FORMULA_REVIEW_FLOOD.md` (§3). Pluvial can exceed 10 before the soft cap (it is not clipped first).

**Constants.** IMD intensity table [S, IMD rainfall classes]; 7 %/°C [S]; modifier weights 0.5 / 0.3 / 0.2 and bounds 0.5–1.5 [A8, bounds from the review]; occurrence reference 1 day/month [A8]; the same intensification factor applied to depth, day count and river potential [A8].

**Scenario handling.** Mean warming raises storm depth, heavy-day count and river-flood potential by the same 7 %/°C factor. Seasonal totals and the timing of the monsoon are not changed.

**Worked example.** Mumbai hex `85608b57fffffff`, August, baseline: `rp10 = 308.8 mm` (IMD table gives 10), flood days 19.34/yr, August carries 73.6 % of the wettest month's rain and 4.59 heavy days; flat 69 %, built 41.3 %, sand 0 %, floodplain 65.5 %.
`modifier = 0.5 + 0.345 + 0.124 + 0.200 = 1.169`; `severity = 10 × 1.169 = 11.69`; `occurrence = 1 − exp(−4.59) = 0.990`; `pluvial = 11.57`; `riverine = 6.55 × 0.736 = 4.82`; `score = soft_cap(11.57) = 9.66`. Under SSP5-8.5 2050 the score is 9.67 (already saturated).

**Sanity checks.** Seasons: Mumbai 9.6–9.7 June–September and about 0.1 in the dry months; Kolkata peaks in July (7.3); Pondicherry peaks October–November (8.2, the north-east monsoon); Patna peaks in July (8.7); Jaisalmer and Delhi stay low (peaks 3.1–3.6). India monthly population-weighted mean: 0.4 in winter to 5.2 in July.

**Limits.** The 10-year storm is used as the severity in every month (the monthly variation comes only from occurrence and river potential); severity saturates for very wet hexes (any hex with `rp10 > 244 mm`); heavy days are spread by mean precipitation (no daily data); no snowmelt, no dams, no urban drainage, no sea or surge flooding; `floodplain_pct` is a DEM-height proxy, not a hydrodynamic flood map. The legacy `pluvial_flood_score` (division by slope, up to ×3.3 on flat land) saturated 93 % of people in the top band and is **not used** here. Hexes without recorded heavy-rain days (678: Jammu & Kashmir 387, Ladakh 289, Arunachal 2; D2) show the **river-flood part only**, a lower bound (`partial_pluvial_hexes` and `coverage_note` in `index.json`). Separately, 209 hexes record zero heavy-rain days although their 10-year daily rain exceeds 100 mm (D1); that is unexplained and not corrected.

**Improvement options.** JRC global river flood maps and return-period depths (`FORMULA_REVIEW_FLOOD.md` §3.2); daily rainfall for real monthly 1-in-10 storms; calibration against the IFI flood-event labels.

---

### 4.3 Drought (`drought_hazard_seasonal`)

**Question answered.** How big a rainfall shortfall does a 1-in-10-year dry spell bring in this place, in a season when rain is due?

**Inputs.** ERA5 monthly precipitation for **all 30 years** (not only the climatology). For each grid cell and calendar month *m*: the 30 values of the 3-month rainfall total ending in *m* (windows that need the previous year are dropped for 1991, so 29 values for Jan and Feb windows).

**Steps** (`compute_drought_4d.py`, `formulas.py:253`).

1. From the yearly window totals: `mean`, sample standard deviation → `CV = std / mean` (zero where annual rain < 1 mm); `share = window mean / annual mean`. `peak_share` = the hex's largest window share. CV and share are sampled bilinearly at the hex centroid.
2. 1-in-10-year dry window relative to normal (gamma distribution, Wilson–Hilferty approximation; `gamma_quantile_ratio`):
   ```text
   k = 1/CV²;   z = Φ⁻¹(0.10) = −1.2816
   ratio = max(0, 1 − 1/(9k) + z·sqrt(1/(9k)))³       # 10th-percentile window rain / mean
   ```
3. Warming (assumptions A9): `CV' = CV × (1 + 0.05 × ΔT)`; `ratio' = ratio(CV') × (1 − 0.01 × ΔT)`. The shortfall is measured against the **baseline** normal.
4. `shortfall = clip(1 − ratio', 0, 1)`; `severity = soft_cap(10 × shortfall / (2/3))`; `score = severity × min(1, share / peak_share)`.

**Why not SPI directly.** SPI is a standardised quantity, so a fixed percentile of it is the same everywhere by construction (the 10th-percentile SPI is −1.28 in every climate); observed SPI values still differ between places and years, but the 1-in-10-year SPI cannot rank places by how severe the shortfall is. The absolute shortfall of a 1-in-10-year window depends on how variable local rain is (arid and monsoon-edge climates score high, steady wet ones low). The legacy `drought_score(spi) = −5 × SPI` is kept in `formulas.py` but not used.

**Constants.** Return period 10 years [A9]; full-shortfall scale 2/3: a 25 % shortfall scores 3.75 and 50 % scores 7.5, anchored on IMD's drought classes (25 % moderate, 50 % severe) [S+A]; relevance weighting by relative window share [A9]; +5 %/°C CV and −1 %/°C net water supply [A9] (assumed from AR6: monsoon rain rises about 3 %/°C, evaporative demand about 4 %/°C, and interannual variability grows).

**Worked example.** Latur (Marathwada) hex `8560801bfffffff`, August window (Jun–Aug): CV 0.236; the window carries 65.6 % of annual rain (and is the hex's wettest window, so relevance 1); `ratio = 0.712`, `shortfall = 0.288`, `score = 10 × 0.288 / 0.667 = 4.33`. SSP5-8.5 2050 (ΔT 1.53): CV 0.255 → score 4.80.

**Sanity checks.** Jaisalmer and Kutch score 8.5–9.5 in the monsoon windows (CV about 0.67); Kochi stays at or below 3; Pondicherry peaks in December–January (the north-east monsoon window); monsoon-core windows peak July–September elsewhere. India baseline monthly bars rise from 0.7 in winter to 4.5 in August–September.

**Limits.** Meteorological drought only: no soil moisture, groundwater, reservoirs, irrigation or evaporative demand in the baseline; the gamma fit is a moment-based approximation (accurate to about 0.3 % for CV ≤ 0.6, about 7 % absolute at CV 1.0 where the answer is near zero anyway); 30 years is a short sample for a 1-in-10 estimate; the climate-change terms are assumed, not modelled; the score's level depends on the 2/3 scale (see section 8: an earlier scale put 98 % of people in the top band).

**Improvement options.** SPEI with a potential evapotranspiration term from monthly temperature; soil-moisture or groundwater (GRACE) data; per-hex rainfall projections instead of the assumed variability change.

---

### 4.4 Wet-bulb (humid heat) (`wet_bulb_hazard_seasonal`)

**Question answered.** How close does the hottest humid afternoon of this month get to the limit of human heat tolerance?

**Inputs.** ERA5 monthly-mean 2 m temperature T and dewpoint Td at the same three afternoon hours (06, 09, 12 UTC). For every month the (T, Td) pair of **each** hour is sampled at the hex centroid.

**Steps** (`compute_wetbulb_4d.py`, `wet_bulb_hazard_best_hour` and `wet_bulb_hazard_seasonal` in `formulas.py`). Steps 1–5 are done for each of the three hours and the **month's score is the maximum over the hours** (corrected 20 October 2026: an earlier version used the hour with the highest air temperature, which is not always the hour with the highest wet-bulb; the correction changed 3,120 of 152,460 baseline cells, mean +0.16, maximum +0.9).

1. Relative humidity (Magnus formula): `RH = 100 × exp(17.625·Td/(243.04+Td)) / exp(17.625·T/(243.04+T))`, with Td capped at T; clipped to 5–99 % (the validity range of Stull's formula).
2. Warming: air temperature rises by the mean warming at **constant relative humidity** (A10).
3. Wet-bulb temperature (Stull 2011, `wet_bulb_temp`): `Tw = T·atan(0.151977·sqrt(RH+8.313659)) + atan(T+RH) − atan(RH−1.676331) + 0.00391838·RH^1.5·atan(0.023101·RH) − 4.686035`.
4. Hottest humid day: `Tw_hot = Tw + 2.0 °C` [A10] (about 2 standard deviations of day-to-day variability of afternoon wet-bulb in humid climates).
5. `score = soft_cap( max(0, (Tw_hot − 28) × 10 / 7) )`: the engine's existing mapping where 28 °C wet-bulb scores 0 and 35 °C scores 10.

**Why the uplift is on wet-bulb.** An earlier version added 3 °C to air temperature at a fixed dewpoint, which lowers humidity and raises wet-bulb by only about 1 °C, so almost nothing scored. On real hot-humid days dewpoint also rises, so the day-to-day uplift belongs on wet-bulb itself.

**Constants.** 28 → 0 and 35 → 10 °C mapping [legacy; **open decision** in `HEX_GRID_MILESTONES.md` (practical danger starts near 31 °C wet-bulb), so absolute levels are provisional]; +2 °C hot-day uplift [A10]; constant-RH warming [A10]; Magnus coefficients and Stull coefficients [S].

**Worked example.** Kolkata hex `853cf28bfffffff`, May, the three hours: 06 UTC T 34.02, Td 25.01 → Tw 27.51 → score 2.16; **09 UTC T 34.54, Td 24.86 → RH 57.3 %, Tw 27.58, `Tw_hot = 29.58`, score `(29.58 − 28) × 10/7 = 2.25`**; 12 UTC T 31.78, Td 25.14 → Tw 26.93 → score 1.32. The month's score is the maximum, 2.25. Under SSP5-8.5 2050 (+1.53 °C at constant RH) it is 4.20. Synthetic regression case in `tests/test_formulas.py`: (36 °C, 22 °C) scores 0.43 while the cooler, more humid (34 °C, 27 °C) scores 4.01, so the hottest hour is not always the worst.

**Sanity checks.** Kolkata peaks in May–June (2.3–2.7), Bhubaneswar in May, Delhi and Patna in July–August (humid monsoon), Jaisalmer near zero, Shimla zero. Baseline: 0 % of people in the top band; SSP5-8.5 2080: 62 %.

**Limits.** Monthly means (daily humid-heat extremes are not resolved, and the +2 °C stands in for them); constant relative humidity is an assumption (land humidity tends to fall slightly with warming); the 28–35 °C scale is not tied to a physiological limit; no radiation or wind (WBGT) term.

**Improvement options.** Decide the threshold (31–35 °C range); daily ERA5 for a real 1-in-10-year humid-heat day; WBGT.

---

### 4.5 Landslide (`landslide_hazard_seasonal`)

**Question answered.** How likely is rain to trigger slope failure here in this month?

**Inputs.** `slope_p90_deg` (the steepest decile of the hex's 90 m DEM cells, from the geojson, because the hex-mean slope hides steep terrain, e.g. Wayanad mean 5.8°); NDVI (`ndvi_mean`); `rain_rp10_mm`; heavy-rain days per month as in 4.2.

**Steps** (`compute_rain_hazards_4d.py`, `formulas.py:340–363`).

```text
S_slope      = 1 − exp(−max(0, slope − 5) / 10)             # 10° → 0.39, 20° → 0.78, 30° → 0.92 [A11]
susceptibility = S_slope × (1.2 − clip(NDVI, 0, 1)) / 1.2    # vegetation factor from the legacy engine
intensity    = min(1, rp10 × (1 + 0.07·ΔT) / 150)            # 150 mm: IMD 'very heavy' band [A11]
occurrence   = 1 − exp(−heavy_days_m × (1 + 0.07·ΔT))        # as for floods
trigger      = intensity × occurrence
score        = soft_cap( 10 × susceptibility × trigger )
```

**Constants.** Slope threshold 5° and e-folding 10° [A11]; vegetation factor [legacy]; reference rain 150 mm [A11]; 7 %/°C [S].

**Worked example.** Darjeeling hex `853c1d2bfffffff`, July, baseline: slope p90 32.98°, NDVI 0.73, rp10 127 mm, 3.01 heavy days. `S_slope = 0.939`; vegetation 0.392; `susceptibility = 0.367`; `intensity = 0.847`; `occurrence = 0.951`; `trigger = 0.805`; `score = 10 × 0.367 × 0.805 = 2.96`.

**Sanity checks.** Monsoon peak (June–September) along the Western Ghats, Himalaya, Northeast and Andamans; Leh and Delhi are zero (the legacy layer's maximum was Leh because it had no rain term). 67 hexes reach 5 or more in any month at baseline; Pune-Ghats peaks at 5.6 in July.

**Limits.** No geology, soil depth, roads, forest loss or earthquake (NASA LHASA-style susceptibility is richer); NDVI is a **single monsoon-peak value** (D3), so vegetation protection is overstated in dry months; antecedent moisture and cumulative rain are not modelled; snowmelt and glacial-lake outbursts are not modelled; **678 hexes with no recorded heavy-rain days are stored as no estimate** (D2; grey on the map, excluded from summaries, covering 8.7 million people); 209 hexes record zero heavy days despite very heavy rain (D1) and are not corrected.

**Improvement options.** A landslide inventory (for example NASA COOLR) for calibration; geology and road density layers; cumulative 3-day rain from daily data.

---

### 4.6 Flash flood (`flash_flood_hazard_seasonal`)

**Question answered.** How likely is intense rain to produce rapid runoff and flash flooding in steep, small catchments?

**Inputs.** `slope_p90_deg`, `lc_built_pct`, sand % (SoilGrids), NDVI, distance to water (`dist_w`), `rain_rp10_mm`, heavy-rain days per month.

**Steps** (`formulas.py:365–386`).

```text
slope_i   = min(1, slope / 15)
runoff_i  = 0.5 × built/100 + 0.5 × (1 − sand/100)           # imperviousness and clay
veg_i     = 1 − clip(NDVI, 0, 1)
chan_i    = exp(−dist_w / 3000 m)                              # proximity to a channel
gate      = min(1, slope / 3)                                  # zero on flat ground
susceptibility = gate × (0.35×slope_i + 0.25×runoff_i + 0.20×veg_i + 0.20×chan_i)   # FFPI-style, weights [A12]
trigger   = min(1, rp10 × (1 + 0.07·ΔT) / 100) × (1 − exp(−heavy_days_m × (1 + 0.07·ΔT)))   # 100 mm reference [A12]
score     = soft_cap( 10 × susceptibility × trigger )
```

**Worked example.** Darjeeling hex, July: slope p90 32.98°, built 0.6 %, sand 38.6 %, NDVI 0.73, distance to water 10,450 m. `slope_i = 1`, `runoff_i = 0.310`, `veg_i = 0.270`, `chan_i = 0.031` → `susceptibility = 0.35 + 0.0775 + 0.054 + 0.0062 = 0.488`; `trigger = 1 × 0.951 = 0.951`; `score = 4.64`.

**Sanity checks.** Peaks July–August in the Ghats, Himalayan foothills and Northeast (4–5.7); Leh zero; Delhi about 1.3 at most. 336 hexes reach 5 or more in any month at baseline.

**Limits.** Weights are uncalibrated (FFPI-style indices are normally calibrated to local flash-flood records); a hex is not a catchment (no upstream area, stream order or drainage density); only 24 h rainfall depth (flash floods depend on 1–6 h intensity); NDVI monsoon-only (D3); the same missing-data handling (no estimate) and unexplained zeros as 4.5.

**Improvement options.** Catchment delineation from the DEM (contributing area, stream network); sub-daily rainfall; flash-flood event records (for example the India flash-flood inventory) for weight calibration.

---

### 4.7 Cold wave (`coldwave_hazard_seasonal`)

**Question answered.** How far below the cold-wave threshold does a cold night of this month fall?

**Inputs.** ERA5 monthly-mean 2 m temperature at 00 UTC (05:30 IST, about sunrise), a proxy for the monthly-mean daily minimum (A13: it is about 0.5–1.5 °C above the true minimum); hex `elevation_mean`.

**Steps** (`compute_coldwave_4d.py`, `formulas.py:389–413`).

```text
cold_night = T_dawn − 4.5 + max(0, mean_warming)               # IMD 4.5 °C departure used as a fixed cold-night offset [A3/A13: a classification threshold, not a tail estimate]; cold nights warm at least as fast as the mean [A13]
w          = clip((elev − 500) / 1000, 0, 1);  threshold = 10 × (1 − w)    # 10 °C plains → 0 °C hills (IMD) [S]+[A6]
score      = soft_cap( max(0, threshold − cold_night) )         # one point per °C below threshold [A13]
```

**Worked example.** Amritsar hex `85424d27fffffff`, January, baseline: dawn T 7.45 °C, elevation 228 m → threshold 10 °C; `cold_night = 2.95`; `score = 10 − 2.95 = 7.05`. Under SSP5-8.5 2050 (+1.53 °C): cold night 4.48, score 5.52.

**Sanity checks.** Winter peaks in the north (Amritsar 7.0 in January, Delhi 5.5, Jaipur 5.1, Lucknow 4.8); the south and Nagpur are zero all year; the hazard **falls** with warming (17 % of people in the top band at baseline to 0.9 % by SSP5-8.5 2080). The legacy cold-wave channel had no temperature input at all.

**Reading the score.** Like heat, a **conditional proxy severity** (a typical IMD-criterion cold night in that month), not an observed cold-wave frequency.

**Limits.** Monthly climatology cannot give cold-wave days or spell length; always-cold hills (Leh, high Himalaya) score near 10 all winter because they are always below the threshold (they are adapted, which the risk formula's adaptive capacity should handle, not the hazard); the dawn-hour proxy biases scores slightly low.

**Improvement options.** Daily minimum temperature (ERA5 hourly, or IMD gridded daily minima) for real cold-wave frequency and duration; departure-from-normal criterion applied to daily data.

---

### 4.8 Exposure counts and the stress comparison

**Why.** DRR frameworks report exposure as *people (and children) inside a hazard class*, not only a score: INFORM and UNICEF CCRI count absolute and relative exposed population, and ThinkHazard reports High and Medium classes (`DRR_RISK_FORMULA_REFERENCES.md` §2). The summaries now do the same, so the effect of each **stress level** (baseline, or a scenario at a horizon) can be read as people and children.

**Definition** (`_aggregate` in `hazard_4d_common.py`; score bands from section 3.5):
```text
people_high           = Σ population of hexes whose score ≥ 5             (the month, or each hex's worst month)
people_medium_or_above= Σ population of hexes whose score ≥ 2.5
children_u5_high      = Σ pop_children_under_5 of hexes whose score ≥ 5     (UNICEF CCRI counts exposed children)
share (%)             = people_high / population of hexes with an estimate × 100
```
Population is the hex `population` (WorldPop 2020) and `pop_children_under_5` (WorldPop × Census age ratios); neither is projected to the scenario year, so future exposure is understated where population grows (caveat 5 in the report). Hexes with no estimate are excluded (section 3.7).

**Where to read it.**
- On `/4d`: the **Stress comparison** table under the monthly bars. It shows, for the selected hazard and month, one number for the baseline and for each scenario × horizon: millions of people, millions of children under 5, % of people, or the mean score (selector at the top right of the table). Clicking a cell switches the map to that scenario.
- As a report: `reports/hazard_4d_stress_outputs_<date>.md`, generated by `python scripts/hazard_4d_stress_report.py`, with, for each hazard, all 13 stress levels (people, children, share, moderate-or-above), the peak month, and the states with the largest increase from baseline to SSP5-8.5 2050.

**What the counts show, and a warning.** The counts are very sensitive near the band edge. For example, heat at SSP1-2.6 in 2030 (+0.8 °C hot-extreme warming) moves people in high/extreme heat from 7.6 million (baseline) to 91.8 million, because many hexes sit just under a score of 5 and the +4.5 °C uplift (A3) puts them near the threshold. Treat large jumps between adjacent stress levels as threshold effects of the assumed construction, not as precise projections. The bands are generic (A16), so counts are comparable **across stress levels within a hazard, not across hazards**.

### 4.9 Alignment with DRR practice

Compared with `DRR_RISK_FORMULA_REFERENCES.md` (INFORM, UNICEF CCRI and GRIP, WASH framework, ThinkHazard, India Finance Commissions, CEEW):

| DRR practice | Status in the 4-D layers | Gap and next step |
|---|---|---|
| Risk = hazard × exposure × vulnerability, reduced by capacity | The 4-D layers are **hazard only** (the "Hazard & Exposure" input of INFORM, not the risk index) | Vulnerability (NFHS, poverty, children) and capacity (WASH access) are not in the 4-D layers. How to combine them (INFORM geometric mean or the engine's product) is the open platform-wide decision D7. |
| Exposure counted as people, absolute and relative (INFORM); children exposed (UNICEF CCRI) | **Implemented** (section 4.8): people and children under 5, absolute and share | INFORM's log scaling of absolute exposure (log 100 to log 10⁶) is built for countries and saturates at India's scale, so counts are reported directly. Elderly and women counts exist in the props but are not summarised yet. |
| Hazard classes tied to return periods: ThinkHazard High/Medium/Low at 10/50/1000 years; CCRI 50-year riverine flood | **Partial**: flood, landslide and flash flood use the hex's 1-in-10-year daily storm; drought uses the 1-in-10 dry window. No 50- or 1000-year classes. | Add 50-year (and longer) storms from the same Gumbel fit; depth classes need flood-depth maps (JRC), not available here. |
| Damaging-intensity thresholds (ThinkHazard 0.5 m flood depth) | Not implemented: flood uses rainfall-based severity (IMD classes) and a floodplain share, not water depth | JRC river flood depth maps (`FORMULA_REVIEW_FLOOD.md` §3.2). |
| Hazard, shock **or stress** (UNICEF GRIP) | Each scenario and horizon is a stress level; the stress comparison reports the outputs under each | Add non-climate stresses only if data exist. |
| Class labels High / Medium / Low | Counts for ≥ 5 (high or extreme) and ≥ 2.5 (moderate or above) | Per-hazard bands would make classes comparable with ThinkHazard's. |
| Indicator scaling (INFORM min–max 0–10, log for counts; CEEW percentiles) | Physical-unit mappings (IMD classes, °C thresholds) onto 0–10 per hazard; bands shared | Document or replace per hazard (backlog item 7). |
| Programme likelihood × impact rating (GRIP 1–5) | Not applicable to the national grid | Useful for facility and site screening only. |
| Validation against observed losses | **Not done** (the DRR indices are also not validated against losses) | Section 8 and backlog item 3. |

## 5. Changes to shared engine components

Not part of the 4-D layers, but changed during the same work. They affect the legacy risk scores.

| Change | Files | Effect |
|---|---|---|
| `heatwave_score` gained a soft cap above 8 and an optional `warming_c` (default 0). | `scripts/risk/formulas.py`, `client/src/lib/simulatorFormulas.ts` (ported) | Scores ≤ 8 unchanged; above 8 slightly lower (8.78 → 8.64 for the vector 47 °C, 40 °C, 5 days, 30 % built, 15 % tree, 2 km to water). |
| `heat_threshold_smooth` replaced the step rule `30 °C if elevation > 800 m` in the risk engine, the forecast, the golden parity test and the simulator (simulator has no coastal tier). | `hex_risk.py`, `compute_forecast.py`, `tests/golden/run_py_side.py`, `simulatorFormulas.ts` | Plateau hexes just above 800 m (Satpura, Chota Nagpur, Deccan) no longer score as hill stations. |
| Data rebuilt locally with the new threshold: `join_hex_districts.py` → `sync_hex_risk_to_props.py` → `build_hex_future_risk.py` → `compute_monthly_climatology.py`. | `india_hex_grid.geojson`, `india_hex_props.json`, `hex_future_risk.json` | `heat_risk` changed in 1,442 of 12,705 hexes (901 up by more than 0.05, 45 down), mean 0.824 → 0.839; the last step also refreshed the flood, wet-bulb and drought monthly patterns and peak-season fields. |
| Parity test vectors added (near the knee and with warming). | `tests/golden/scenario.json`, `run_ts_side.ts` | Python and TypeScript heat formulas are checked against each other (45 vectors). |

Legacy functions **kept but not used by the 4-D layers**: `pluvial_flood_score`, `drought_score`, `wet_bulb_score`, and the static landslide, flash-flood and cold-wave blocks in `hex_risk.py`.

---

## 6. Assumption register

Status: **S** sourced, **D** derived, **A** assumed/uncalibrated. "Sensitivity" is a judgement of how much the maps change if the value is wrong (H high, M medium, L low); it has not been tested numerically.

| ID | Where | Assumption | Basis | Status | Sensitivity | How to improve |
|---|---|---|---|---|---|---|
| A1 | `scenarios.py` | One warming value per scenario/horizon, uniform in space and month; India's mean warming equals the global mean (no regional factor) | AR6 SPM.1 rows and baseline shift (0.87 °C) derived in code, section 3.3 | D/A | H (drives every scenario difference) | Per-hex, per-month CMIP6 deltas (NEX-GDDP); model spread |
| A2 | `scenarios.py` | Hot extremes warm 1.2× the mean (heat layer only) | AR6 Ch.11 says faster than the mean; the factor is assumed | A | M | Region-specific scaling from CMIP6 |
| A3 | heat, cold wave | +4.5 °C added to every hex's monthly maximum (heat) and subtracted from the monthly dawn temperature (cold wave) as a fixed tail uplift | IMD's 4.5 °C departure is a classification threshold [S]; using it as a tail estimator is an assumption | A | H | Per-hex, per-season extreme departures and spell frequencies from daily data. Scores are conditional proxy severity until then |
| A4 | heat, wet-bulb | Hottest of 06/09/12 UTC monthly means stands in for the daily maximum | Practical (the monthly product has no max parameter) | A | M | Daily ERA5 or IMD gridded Tmax |
| A5 | heat | Spell length fixed at 3 days, +15 %/°C, capped at 5 | Formula book; gain assumed | A | M | Spell statistics from daily data |
| A6 | heat, cold | 500–1,500 m blend between plains and hill thresholds | Design choice to remove the 800 m cliff | A | M | Fit to IMD station criteria |
| A7 | all | Soft-cap knee at 8 | Design choice | A | L | None needed |
| A8 | flood | 7 %/°C on depth, days and river potential; 1 day/month occurrence reference; ponding modifier weights 0.5/0.3/0.2; heavy days spread by mean precipitation; `max(pluvial, riverine)` | CC scaling S; rest assumed (review v2 sketch) | A | H | Calibrate to IFI flood labels; daily rainfall |
| A9 | drought | 10-yr return; scale 2/3 (IMD classes); relevance by relative window share; CV +5 %/°C; supply −1 %/°C | IMD classes S; rest assumed | A | H | SPEI, soil moisture, projected rainfall |
| A10 | wet-bulb | 28→35 °C mapping; +2 °C hot-day uplift on wet-bulb; constant RH under warming | Mapping legacy and an open decision; rest assumed | A | H | Settle threshold; daily data |
| A11 | landslide | Slope function (5° onset, 10° e-fold); vegetation factor; 150 mm trigger reference | Assumed | A | H | Landslide inventory calibration |
| A12 | flash flood | FFPI weights 0.35/0.25/0.20/0.20; 15° saturation; 3,000 m channel scale; 3° gate; 100 mm reference | Assumed (FFPI structure) | A | H | Catchment-based FFPI, event records |
| A13 | cold wave | Dawn-hour mean as daily minimum; 4.5 °C departure; 1 point/°C; cold nights warm by the mean | IMD criteria S; rest assumed | A | M | Daily minima |
| A14 | all | 1991–2020 climatology is the baseline; ERA5 0.25° values at the hex centroid represent the hex | Standard WMO normal; ERA5 is a reanalysis with biases | A | M | Station bias checks (IMD) |
| A15 | all | Monthly granularity | Data limit | A | M | Daily data |
| A16 | all | Bands 0.5/2.5/5/7.5 identical for every hazard | Generic | A | L | Hazard-specific bands |
| A17 | drought | Wilson–Hilferty gamma approximation | Accuracy tested vs scipy | D | L | Exact gamma if scipy is allowed |

---

## 7. Data defects and gaps

| ID | Defect | Evidence | Effect | Fix |
|---|---|---|---|---|
| D1 | 209 hexes record **zero** heavy-rain days although `rain_rp10_mm` exceeds 100 mm: Arunachal Pradesh 155, Jammu & Kashmir 48, Assam 6 | Count from props and geojson | **Unexplained**: could be a different sampling period or a rare-event model rather than a raster gap. Kept as recorded zeros; pluvial flood, landslide and flash-flood hazards may be understated there | Investigate the source of `flood_days_per_year` for these hexes before correcting |
| D2 | 678 hexes have **no recorded** `flood_days_per_year`: Jammu & Kashmir 387, Ladakh 289, Arunachal Pradesh 2 (8,682,409 people) | Count from the geojson | Landslide and flash flood are stored as **no estimate** (−1, grey, excluded from summaries; coverage 99.3 % of people). Flood shows the river part only, a lower bound | Earth Engine re-export of the heavy-rain days (`HEX_GRID_MILESTONES.md`) |
| D3 | NDVI is a single 250 m pixel from 28 Jul–30 Sep 2023 only | `BASE_LAYERS.md` | Vegetation protection overstated in dry months (landslide, flash flood) | Annual zonal-mean NDVI |
| D4 | Hex inputs are summaries of 343 sub-cells; ERA5 is sampled at one point | Methodology | Local gradients (valleys, coasts, cities) are smoothed | Zonal statistics; finer climate data |
| D5 | Coastal hexes missing from the grid (Chennai, Kochi, Mangaluru, 655 overlap hexes) | `HEX_GRID_MILESTONES.md` | These cities have no 4-D values | Grid extension |
| D6 | ERA5 is coarse (28 km) and has known biases (cool bias in arid zones, smoothed orography) | Reanalysis documentation; only Delhi and Nagpur compared with IMD normals | Absolute temperatures and rainfall may be off by 1–2 °C or 10–30 % locally | Station bias correction |
| D7 | The Andaman and Nicobar island hexes appear as isolated columns | Visible on the maps | Few hexes; values plausible but not validated | Review |
| D8 | The hex grid holds **1,224 million people**, about 10 % fewer than the 1,354 million national total quoted in `BASE_LAYERS.md` | Sum of `population` over the 12,705 hexes; children under 5 sum to 115 million | All people and children counts are within the grid and understate the national population; missing coastal and overlap hexes (D5) are one cause, others not investigated | Reconcile the grid total with the national total |

---

## 8. Verification performed, and what was not verified

**Performed (19 October 2026).**
- `pytest` (`python -m pytest tests --ignore=tests/golden`): 108 tests passed on 20 October 2026, including formula tests for every hazard function, the scenario-derivation tests (`tests/test_scenarios.py`), base-layer tests and future-risk tests. Hand-computed expected values are in `tests/test_formulas.py`. (The independent audit ran a smaller selection, 59 tests, without the scenario and multi-hazard files.)
- Golden parity test (`bash tests/golden/run.sh`): 45 formula vectors match between Python and TypeScript within 0.0001.
- Backtests (`scripts/backtest_events.py`), all passing with the smooth heat threshold: Mumbai 2005 7.06, Kerala 2018 5.25, Amphan 3.83 / 6.74, Marathwada 2016 6.76, Delhi heat wave 2023 6.59.
- Refactors verified by file hashes: moving the shared scenario and writer code left the heat and flood output files byte-identical.
- Approximation accuracy: the Wilson–Hilferty gamma quantile compared with scipy's exact gamma (0.3 % up to CV 0.6).
- Spot checks of seasons and places for every hazard (the "sanity checks" in section 4) and 3-D/flat renders in a real browser for all seven tabs without errors.
- Audit fixes (20 October 2026), all verified by re-running the layers: missing heavy-rain data is now "no estimate" instead of zero (678 hexes; coverage reported); wet-bulb scores each afternoon hour and takes the maximum; the scenario table is derived in code from AR6 SPM.1; the 4.5 °C uplift is reclassified as an assumption; the grid-resolution statement was corrected. Flood and landslide baseline scores are unchanged on hexes with data (identical files), so only the intended cells moved.
- Exposure counts (4.8): all 91 score files were byte-identical before and after adding the counts (only `index.json` changed); the stress comparison table and its metric selector were checked in a browser (heat, May: 8 million people in high/extreme at baseline, 469 million at SSP5-8.5 2050, 977 million at 2080).
- Iterations that failed and were corrected, kept here for audit: drought scale first put 98 % of people in "high"; wet-bulb's hot-day uplift applied to temperature understated by two-thirds; flood with the legacy pluvial formula saturated at 93 % of people; heat with a 3 °C uplift gave baselines that were too low.

**Not verified.**
- **No independent validation against observed events or records** for any 4-D score (no flood-event labels, landslide inventory, drought indices, cold-wave day counts or heat-wave counts). The backtests above test the legacy risk formula, not the 4-D layers.
- ERA5 was compared with IMD normals only for Delhi and Nagpur maxima.
- Scenario projections have not been compared with CMIP6 or any regional downscaling; the 0.87 °C baseline shift is an interpolation, not an AR6 number.
- No sensitivity analysis (the sensitivity column in section 6 is a judgement).
- The forecast pipeline (`compute_forecast.py`) was not run end to end. The no-estimate display and the coverage line on the page were checked in a browser (section 8, 20 October) but not every control on every tab.

---

## 9. Reproducing the layers from scratch

Environment: a Python 3 virtual environment with `numpy`, `netCDF4`, `h3`, `cdsapi`, `geopandas`, `rasterio`, `scipy`, `pandas`, `pytest`; a free Copernicus CDS account with the key in `~/.cdsapirc` and the ERA5 licence accepted. ERA5 requests queue at Copernicus (minutes to hours).

```bash
# 1. Climate downloads (each cached; re-runs skip files that exist)
python scripts/fetch_monthly_temp_climatology.py
python scripts/fetch_monthly_dewpoint_climatology.py
python scripts/fetch_monthly_tmin_climatology.py
python scripts/fetch_monthly_precip_climatology.py

# 2. Layers (about 1–3 minutes each)
python scripts/compute_heat_4d.py
python scripts/compute_flood_4d.py
python scripts/compute_drought_4d.py
python scripts/compute_wetbulb_4d.py
python scripts/compute_rain_hazards_4d.py     # landslide and flash flood
python scripts/compute_coldwave_4d.py

# 3. Stress report (reads the summaries above)
python scripts/hazard_4d_stress_report.py 2026-10-20

# 4. Tests
python -m pytest tests --ignore=tests/golden
bash tests/golden/run.sh
python scripts/backtest_events.py
```

To view: `npx vite dev --port 5000` then open `/4d`, or `/4d?hazard=flood` (any of `heat`, `flood`, `drought`, `wetbulb`, `landslide`, `coldwave`, `flashflood`).

To add or change a hazard: write a pure function in `formulas.py` with tests, write a compute script that supplies a per-hex, per-month score function to `write_layer()` in `hazard_4d_common.py`, and add one entry to `HAZARD_4D` in `client/src/pages/Hazard4DPage.tsx`.

Data licences (from `BASE_LAYERS.md` and the CDS records): ERA5 (Copernicus, attribute "Generated using Copernicus Climate Change Service information"); CHIRPS (public domain); Copernicus DEM GLO-90 (free licence, notice required); ESA WorldCover 2021, ISRIC SoilGrids 2.0 and WorldPop 2020 (CC BY 4.0); MODIS MOD13Q1 (open, cite Didan 2021); OpenStreetMap rivers (ODbL). Free tiers are used throughout; the Open-Meteo forecast pipeline (not used by the 4-D layers) needs a commercial licence for commercial use.

---

## 10. Audit checklist and improvement backlog

**Questions for an auditor.**
1. Is the scenario table (A1, A2) acceptable for the intended audience, or must it come from CMIP6 before any use outside development?
2. Are the 4.5 °C heat and 2 °C wet-bulb hot-day uplifts (A3, A10) reasonable for the regions that matter most?
3. Should the wet-bulb 28–35 °C scale be replaced (A10, open decision) before the layer is shown?
4. Which hazards need calibration against observed events before their absolute levels are quoted (flood, drought, landslide, flash flood in particular)?
5. Is a shared band definition (A16) acceptable, or should "high" be defined per hazard?
6. Should always-cold hills score high on the cold-wave layer (section 4.7) or be excluded as adapted?

**Improvement backlog, in suggested order.**
1. Replace the warming table with per-hex, per-month CMIP6 deltas (A1, A2); add an uncertainty range across models.
2. Fix data defects D1–D3 (heavy-day gaps, annual NDVI) and extend the grid (D5).
3. Calibrate against observations: IFI flood events (flood), NASA COOLR (landslide), IMD heat and cold-wave day counts (heat, cold wave), SPI/soil-moisture records (drought).
4. Move to daily ERA5 where it matters: per-hex T95 and EHF (heat), daily minimum (cold wave), real 1-in-10 daily humid-heat (wet-bulb), daily rainfall for storm statistics (flood, landslide, flash flood).
5. Drought: SPEI with evaporative demand; add soil moisture and groundwater.
6. Flash flood: catchment delineation (contributing area, stream order) instead of hex-level proxies.
7. Settle the wet-bulb threshold and define hazard-specific bands.
8. Run a numerical sensitivity analysis of the assumptions A1–A13.
9. Align the legacy engine channels (static landslide, flash flood, cold wave; legacy pluvial and drought scores) with these formulas, or retire them, during the all-hazard rebuild.

---

## 11. Formula quick reference

```text
soft_cap(x)             = x                         (x <= 8)
                        = 8 + 2(1 − exp(−(x−8)/2))  (x > 8)
mean_warming            = AR6_GSAT(scenario, horizon) − 0.87   (baseline 0);  hot_extreme_warming = round(1.2 × mean_warming, 1)

HEAT       threshold    = base·(1−w) + 30·w ;  base = 37 (coast < 50 km) | 40 ;  w = clip((elev−500)/1000, 0, 1)
           score        = soft_cap( (excess/8)(days/5)·10 · (1+0.3·built) · (1−0.2·tree) · (1−0.1·e^(−d/3000)) )
                          excess = max(0, T_m + 4.5 + ΔT_hot − threshold);  days = min(3(1+0.15·ΔT_hot), 5)
FLOOD      score        = soft_cap( max( IMD(rp10·I)·M · (1 − e^(−heavy·I)) ,  (floodplain/10)·share·I ) )
                          I = 1 + 0.07·ΔT ;  M = 0.5 + 0.5·flat + 0.3·built + 0.2·(1 − sand)
DROUGHT    score        = soft_cap( 10·shortfall/(2/3) ) · min(1, share/peak_share)
                          shortfall = clip(1 − G(CV(1+0.05ΔT))·(1−0.01ΔT), 0, 1);  G(cv) = max(0, 1 − 1/9k + z·√(1/9k))³, k = 1/cv², z = −1.2816
WET-BULB   score        = max over the 3 afternoon hours of soft_cap( max(0, (Stull(T+ΔT, RH) + 2 − 28)·10/7) ) ;  RH = Magnus(T, Td) held constant
LANDSLIDE  score        = soft_cap( 10 · (1−e^(−(slope_p90−5)/10)) · (1.2−NDVI)/1.2 · min(1, rp10·I/150) · (1 − e^(−heavy·I)) )
FLASH      score        = soft_cap( 10 · gate · (0.35·min(1, s/15) + 0.25·(0.5·built+0.5·(1−sand)) + 0.2·(1−NDVI) + 0.2·e^(−d/3000))
                                    · min(1, rp10·I/100) · (1 − e^(−heavy·I)) );  gate = min(1, s/3)
COLD WAVE  score        = soft_cap( max(0, threshold − (T_dawn − 4.5 + ΔT)) ) ;  threshold = 10·(1 − clip((elev−500)/1000, 0, 1))
```
