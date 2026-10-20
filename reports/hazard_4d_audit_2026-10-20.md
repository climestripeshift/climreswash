# Hazard 4-D calculator audit — 20 October 2026

**Verdict: changes required.** The stored scores and summaries are internally consistent, but missing rainfall data is presented as zero hazard, the wet-bulb hour selection can miss the most humid heat, and some scientific provenance claims need correction.

Scope: `HAZARD_4D_CALCULATIONS.md`, the six `compute_*_4d.py` scripts (seven hazards), `hazard_4d_common.py`, seasonal formulas, scenario constants, saved outputs, and the consuming `/4d` page. This was a source/data audit, not a browser audit or independent validation against observed disasters. No application code, formula constants, source reference, or hazard datasets were changed.

## Findings

### 1. P1 — Missing heavy-rain observations become zero hazard

Location: `scripts/hazard_4d_common.py:55–63`; consumers in `compute_flood_4d.py` and `compute_rain_hazards_4d.py`.

`fd = flood_days or 0.0` collapses missing observations into a measured zero. Both slope-hazard formulas multiply by the resulting zero rain trigger. There is no validity mask in the output: the frontend displays these cells as having no hazard, and the aggregate denominator includes their population.

Current inputs contain **678 missing-observation hexes representing 8,682,409 people**: Jammu & Kashmir 387, Ladakh 289, Arunachal Pradesh 2. All 678 have zero landslide and flash-flood scores in every month of all 13 scenario files. The reference's statement that all 678 are in J&K/Ladakh is slightly inaccurate. Flood's pluvial component is also zero, though its riverine component can remain positive.

Separately, **209 hexes** have a recorded heavy-day count of zero despite `rain_rp10_mm > 100`: Arunachal 155, J&K 48, Assam 6. This mismatch warrants investigation; a different sampling period or rare-event model means it is not, by itself, proof of a raster defect.

Fix: preserve missingness, export validity/coverage metadata, display “no estimate,” and exclude invalid scores from hazard aggregates while reporting population coverage. Investigate suspicious recorded zeros separately. The reference already acknowledges much of this limitation, but documentation does not correct the numerical/display behavior.

### 2. P2 — Wet-bulb calculation selects the hottest dry-bulb hour

Location: `scripts/compute_wetbulb_4d.py:70–72`.

The code uses `argmax(T)` and selects the matching dewpoint. Maximum air temperature need not coincide with maximum wet-bulb temperature. The stated “hottest humid afternoon” can therefore be understated even within the three available afternoon hours.

Reproduction using the actual formula: `(T=36°C, Td=22°C)` gives wet-bulb 26.303°C and score **0.433**; `(T=34°C, Td=27°C)` gives wet-bulb 28.809°C and score **4.012**. The current selection chooses the first pair. These are synthetic inputs demonstrating the algorithmic error, not measured local bias.

Fix: sample each paired hour's temperature/dewpoint at the hex, calculate the humid-heat score for each hour under the selected warming, and select the maximum. Add a regression case where the warmest hour is drier. The magnitude across the actual ERA5 dataset remains unmeasured.

### 3. P2 — The fixed heat-day uplift is misclassified as sourced

Location: `HAZARD_4D_CALCULATIONS.md`, sections 4.1 and 6 (A3); `scripts/compute_heat_4d.py:53–54`. The cold-wave tail uses the analogous construction.

IMD's 4.5°C departure is an event-classification threshold. It does not establish that adding 4.5°C to every monthly temperature normal estimates that month's extreme, its frequency, or its return period. The reference labels the heat uplift **S**, although applying that value as a universal tail estimator is an uncalibrated modeling assumption. The same distinction applies when subtracting 4.5°C from monthly dawn temperature.

Fix: retain the IMD threshold attribution, classify its use as a fixed tail uplift as **A**, and label results as conditional proxy severity. Estimate regional/seasonal extreme departures and spell frequencies from daily data before claiming observed heat/cold-wave hazard. [IMD criteria](https://mausam.imd.gov.in/Forecast/marquee_data/Press%20Release%2017-02-2026.pdf) support classification thresholds, not this statistical tail estimate.

### 4. P2 — Scenario numbers cannot be reproduced from the stated derivation

Location: `scripts/risk/scenarios.py:1–21`; reference section 3.3.

The reference says the table was derived from AR6 Table SPM.1 by shifting baseline and multiplying by 1.2. Neither code nor reference supplies the numerical baseline offset, the mapping from projection averaging periods to the 2030/2050/2080 labels, or a worked derivation of the table entries. `mean_warming()` merely divides these hard-coded values by 1.2; it does not independently substantiate mean land warming.

Fix: provide exact source rows, periods, baseline adjustment and arithmetic in a reproducible table/script, or describe these values as illustrative scenario assumptions. Spatial uniformity and absent uncertainty are already disclosed; this finding concerns the stronger claim of a traceable derivation, not a proven numerical error in the table.

### 5. P3 — The grid-resolution explanation reverses the area ratio

Location: `HAZARD_4D_CALCULATIONS.md:72`.

“One hex is about 3 ERA5 cells” is incorrect. At 25°N, a 0.25° grid spacing corresponds to approximately 28 × 25 km, or about 700 km²; a roughly 252 km² hex occupies about one-third of that nominal grid area. Several hexes share the coarse climate information. Bilinear interpolation uses four surrounding grid points; it does not provide four independent climate observations within a hex. Actual mean area of the current H3 cells is approximately 258.44 km².

Fix: reverse the ratio and distinguish interpolation support from spatial resolution. Terrain/cover sampling density does not increase ERA5's climate resolution.

## Verification

- Checked all **91 score files**: seven hazards × 13 scenario/baseline combinations. Each has 12,705 rows, 12 integer scores per row, all within 0–100, with unique IDs in exactly the props order.
- Independently recomputed national and every stored state aggregate, for all months and per-hex worst month. No discrepancies beyond rounding tolerance. This verifies arithmetic against stored scores, not scientific accuracy or data coverage.
- Existing formula, base-layer, future-risk and scenario-signal tests: **59 passed**.
- Golden comparison: **PASS**, including 45 formula vectors and existing regression gates. The shell runner hit a sandbox IPC restriction in `npx tsx`; invoking the same TypeScript runner with `node --import tsx` succeeded, followed by `compare.py`. Known Tier 2b differences remain as documented by that suite. These parity checks cover shared legacy formulas, not all seven seasonal pipelines.
- Confirmed missing-input zero outputs for both slope-hazard layers across all months/scenarios. Detailed counts and aggregate results: [data_checks.json](hazard_4d_audit_2026-10-20/data_checks.json).

Limits: did not regenerate layers from raw NetCDF (available audit interpreter lacks numpy/netCDF4), download climate data, run browser controls, or calibrate against observed events. The reference's historical “92 tests passed” claim was not independently reproduced as that exact test selection.

Additional documentation notes: soft compression preserves ordering before quantization, but rounding to 0.1 still creates ties and exact 10.0 values (754 cold-wave hexes reach stored 10.0 under SSP5-8.5/2080). The statement that SPI is “identical everywhere” should refer specifically to a fixed percentile of a standardized distribution; observed SPI values can differ between places and times. Soil and NDVI also retain sampling limitations distinct from the newer 343-point terrain/cover summaries.
