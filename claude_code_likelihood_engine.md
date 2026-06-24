# Claude Code Brief — Climatology / Likelihood Engine

**The problem this fixes:** Current hazard scores are severity-only. Every hex is fed the same fixed event (50mm rain, 44°C, etc.), so the map shows terrain amplification, not real hazard. Rajasthan scores high for flood despite being a desert. This brief adds the missing **likelihood** dimension so that:

> **Hazard = Severity × Likelihood**

where Severity = existing formula output, and Likelihood = how often that hazard threshold is actually crossed at each hex, from 30 years of climate data.

**Data sources (both free, no registration):**
- **CHIRPS** — daily rainfall, 1981–present, 5 km, for flood + drought frequency
- **ERA5 / ERA5-Land** — hourly temperature, humidity, wind, 1959–present, ~9–30 km, for heat + wet-bulb + cyclone-wind frequency

---

## Scope

This brief ONLY builds the likelihood engine and wires it into the existing risk computation. Do NOT change the severity formulas. Do NOT touch the frontend. Do NOT change the NFHS/demographics work.

---

## Conceptual model

For each hex and each hazard, compute a **likelihood score (0–1)** = the normalized frequency of crossing the damage threshold, based on 30 years of data.

> Likelihood = clip(0, 1, observed annual frequency ÷ reference frequency)

Then in the risk pipeline:

> hazard_score = severity_score × likelihood

A few worked intentions (not code):
- Kerala: flood severity high (terrain) × flood likelihood high (rains often) = genuinely high ✓
- Rajasthan: flood severity high (flat) × flood likelihood low (rarely rains hard) = correctly low ✓
- Jaisalmer: heat severity high × heat likelihood high (frequent 45°C) = correctly high ✓

---

## Data acquisition

### CHIRPS (rainfall) — MANUAL or scripted download

- Source: https://data.chc.ucsb.edu/products/CHIRPS-2.0/
- Product: `global_daily` or `africa_daily`→ use **global_daily**, format NetCDF or COG
- Resolution: 0.05° (~5 km)
- Period needed: 1991–2020 (30-year standard climatology window)
- For India, clip to bounds: lon 68–98, lat 6–37
- Practical: the annual NetCDF files (`chirps-v2.0.YYYY.days_p05.nc`) — 30 files, one per year
- Alternative access: Google Earth Engine has CHIRPS as `UCSB-CHG/CHIRPS/DAILY` — can export India-clipped daily rainfall, or better, export pre-computed frequency rasters directly (see GEE note below)

### ERA5 (temperature, humidity, wind) — via Copernicus or GEE

- Source: Copernicus Climate Data Store (CDS) — needs free API key, OR
- **Easier: Google Earth Engine** has ERA5 as `ECMWF/ERA5_LAND/DAILY_AGGR` and `ECMWF/ERA5/DAILY`
- Variables needed: daily max 2m temperature, daily mean 2m dewpoint (for humidity→wet bulb), daily max 10m wind
- Period: 1991–2020

### GEE shortcut (RECOMMENDED — avoids huge downloads)

Rather than downloading 30 years of daily grids (hundreds of GB), compute the frequencies **inside Google Earth Engine** and export only the resulting frequency rasters. This is dramatically lighter.

Provide a GEE script (saved as `scripts/gee_climatology.js`, run manually by the user) that, for the period 1991–2020, computes per-pixel:

| Output raster | Definition |
|---|---|
| `flood_freq.tif` | Mean annual count of days with rainfall > 50 mm (CHIRPS) |
| `extreme_rain_freq.tif` | Mean annual count of days with rainfall > 100 mm (CHIRPS) |
| `heat_freq.tif` | Mean annual count of days with T_max > 40 °C (ERA5) |
| `severe_heat_freq.tif` | Mean annual count of days with T_max > 45 °C (ERA5) |
| `drought_freq.tif` | Number of months in 30 yrs with monthly rainfall < 50% of climatological mean, ÷ 360 (CHIRPS) |
| `high_wind_freq.tif` | Mean annual count of days with wind > 60 km/h (ERA5) |
| `wet_bulb_freq.tif` | Mean annual count of days with computed T_wb > 28 °C (ERA5 temp + dewpoint) |

All exported India-clipped to Drive, then downloaded into `data/raw/climatology/`.

The GEE script should be written and saved but NOT run by Claude Code (user runs it manually — same pattern as previous GEE steps).

### Cyclone (IBTrACS) — separate, simpler

- Source: https://www.ncei.noaa.gov/products/international-best-track-archive
- Download: `IBTrACS.NI.list.v04r00.csv` (North Indian Ocean basin only — much smaller)
- This is a CSV of historical cyclone tracks (lat/lon points with wind speed)
- Used to compute, per hex: annual probability of a track passing within 150 km

---

## Files to create

```
/scripts/
  gee_climatology.js              # GEE script (user runs manually)
  compute_likelihood.py           # Reads frequency rasters → likelihood per hex
  compute_cyclone_likelihood.py   # IBTrACS tracks → cyclone probability per hex
/data/raw/climatology/            # Frequency rasters from GEE (gitignored)
  flood_freq.tif
  extreme_rain_freq.tif
  heat_freq.tif
  severe_heat_freq.tif
  drought_freq.tif
  high_wind_freq.tif
  wet_bulb_freq.tif
/data/raw/cyclone/
  IBTrACS.NI.list.v04r00.csv
```

Plus MODIFY:
```
/scripts/join_hex_districts.py    # multiply severity × likelihood (the fix)
```

---

## Part 1 — `compute_likelihood.py`

For each hex, run zonal stats (mean) on each frequency raster to get the hex's frequency value, then normalize to a 0–1 likelihood.

Normalization reference values (tunable, these are starting points):

| Likelihood column | Raster | Reference (maps to 1.0) |
|---|---|---|
| `flood_likelihood` | flood_freq | 15 days/yr of >50mm = 1.0 |
| `extreme_rain_likelihood` | extreme_rain_freq | 5 days/yr of >100mm = 1.0 |
| `heat_likelihood` | heat_freq | 60 days/yr of >40°C = 1.0 |
| `severe_heat_likelihood` | severe_heat_freq | 15 days/yr of >45°C = 1.0 |
| `drought_likelihood` | drought_freq | already 0–1 from GEE definition |
| `high_wind_likelihood` | high_wind_freq | 10 days/yr of >60km/h = 1.0 |
| `wet_bulb_likelihood` | wet_bulb_freq | 30 days/yr of T_wb>28°C = 1.0 |

Formula per hex: `likelihood = clip(0, 1, hex_frequency / reference_frequency)`

Output: add these 7 likelihood columns to the hex GeoJSON.

If a raster is missing → MOCK MODE with clearly-logged random values in a plausible range, pipeline continues.

## Part 2 — `compute_cyclone_likelihood.py`

1. Read IBTrACS North Indian Ocean CSV (historical tracks, ~1900–present; use 1981–2020 for consistency)
2. For each hex centroid, count how many distinct cyclone tracks passed within 150 km over the 40-year record
3. `cyclone_likelihood = clip(0, 1, tracks_within_150km / 40 / reference_annual_prob)` where reference = 0.5 (i.e. a track every other year = 1.0)
4. Coastal hexes near Bay of Bengal should score high; inland hexes ~0

Output: add `cyclone_likelihood` column to hex GeoJSON.

## Part 3 — Modify `join_hex_districts.py`

This is the actual fix. Find where hazard scores are currently computed (around lines 232–262 per the diagnostic). Currently:

```
flood_haz = pluvial_flood_score(50, sand_pct, built_pct, slope)   # severity only
```

Change to multiply by likelihood:

```
flood_severity = pluvial_flood_score(50, sand_pct, built_pct, slope)
flood_haz = flood_severity * hex["flood_likelihood"]
```

Apply the same pattern to every hazard:

| Hazard | Severity (existing) | × Likelihood column |
|---|---|---|
| Pluvial flood | pluvial_flood_score(...) | flood_likelihood |
| Heatwave | heatwave_score(...) | heat_likelihood |
| Severe heat | (severe variant) | severe_heat_likelihood |
| Drought | drought_score(...) | drought_likelihood |
| Wet bulb | wet_bulb_score(...) | wet_bulb_likelihood |
| Cyclone | cyclone_score(...) | cyclone_likelihood |

The severity functions stay UNTOUCHED. Only the pipeline multiplication changes.

IMPORTANT: keep both values in the output so we can show users the breakdown:
- `<hazard>_severity` (the "if it happens" score)
- `<hazard>_likelihood` (the "how often" score)
- `<hazard>_hazard` (the product — the true hazard)

## Part 4 — Validation

After the fix, re-check the three diagnostic hexes. Expected change:

| Hex | Before (severity only) | After (severity × likelihood) | Sanity |
|---|---|---|---|
| Bharatpur, Rajasthan | flood 4.55 | flood should DROP sharply | Desert rarely floods ✓ |
| Mysore/Kerala | flood 6.06 | flood should stay HIGH | Heavy monsoon ✓ |
| Jaisalmer | (was moderate) | heat should be HIGH, flood LOW | Desert = hot, dry ✓ |

Print a before/after comparison table for ~10 sample hexes across climate zones so the user can eyeball that the fix produces sensible geography.

---

## Acceptance criteria

- [ ] `scripts/gee_climatology.js` written and saved (NOT run — user runs it)
- [ ] `compute_likelihood.py` produces 7 likelihood columns per hex (real or mock)
- [ ] `compute_cyclone_likelihood.py` produces cyclone_likelihood per hex from IBTrACS
- [ ] `join_hex_districts.py` modified so hazard = severity × likelihood
- [ ] Output GeoJSON has, per hazard: `_severity`, `_likelihood`, `_hazard` columns
- [ ] Validation table printed showing before/after for sample hexes across climate zones
- [ ] Desert hexes show LOW flood hazard; Kerala shows HIGH flood hazard; Thar shows HIGH heat hazard
- [ ] Severity formula functions UNCHANGED (diff shows no edits to formulas.py)
- [ ] All existing tests still pass

---

## Rules for Claude Code

1. Do NOT modify the severity formulas in `formulas.py`. Only the pipeline multiplication changes.
2. Do NOT run the GEE script — save it for the user to run manually (same pattern as earlier GEE steps).
3. If frequency rasters or IBTrACS data are missing, use clearly-logged MOCK MODE and continue.
4. Keep severity, likelihood, AND product as separate columns — don't collapse them, users need the breakdown.
5. Normalization reference values go in a config block at the top of `compute_likelihood.py` so they're tunable, not buried.
6. Idempotent pipeline. Log every step.
7. Print the before/after validation table — this is how we confirm the fix worked.
8. After completing, show the validation table and stop. Wait for confirmation.

---

## What the user does manually

1. Open https://code.earthengine.google.com, paste `scripts/gee_climatology.js`, run the 7 export tasks → download resulting rasters into `data/raw/climatology/`
2. Download IBTrACS North Indian Ocean CSV from NOAA into `data/raw/cyclone/`
3. Then run the three Python scripts in order

All free, no registration except a Google account for GEE.

---

## END OF BRIEF
