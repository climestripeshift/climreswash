# Claude Code Brief — Piece A: Future Hazard Layer (CMIP6 + Delta-Change)

**Goal:** Produce future risk surfaces for 2030 and 2050 under SSP2-4.5 and SSP5-8.5, by feeding *projected* day-counts into the existing risk engine. Use the delta-change method for bias correction so projections are credible. This is the foundation for the gap analysis (Piece B).

**Why it's tractable:** The duration engine already made `days_per_year` an explicit input. Future risk = the SAME engine fed projected day-counts. The risk math does NOT change. Only the day-count source changes.

**Scope:** This brief only. GEE script for future climate frequencies + delta-change bias correction + run existing engine → 4 future risk surfaces. Do NOT change the risk formula, vulnerability layers, or recommendations. Do NOT build the gap-analysis page (that's Piece B).

---

## The method — delta-change (read this first, it's the crux)

Climate models have systematic biases (a model might say 38°C where reality is 41°C). Running thresholds against raw model output produces garbage. The fix: never use the model's absolute values — use the model's *change*, applied to your real observed baseline.

```
future_days[hex, hazard] = observed_baseline_days[hex, hazard]
                         + ( model_future_days[hex, hazard] − model_historical_days[hex, hazard] )
```

- `observed_baseline_days` = the real day-counts you already extracted (CHIRPS/ERA5, from the duration engine)
- `model_historical_days` = the SAME CMIP6 model's day-counts for a historical reference period (e.g. 1995–2014)
- `model_future_days` = that model's day-counts for the future window (2030 or 2050)

The model's bias cancels because it appears in both historical and future terms. Clamp results to ≥ 0 (can't have negative days).

This is the standard, defensible, explainable approach. State it plainly in any methodology doc.

---

## Scenarios & horizons (confirmed)

| | 2030 (2021–2040 window) | 2050 (2041–2060 window) |
|---|---|---|
| SSP2-4.5 (middle path) | ✓ | ✓ |
| SSP5-8.5 (high emissions) | ✓ | ✓ |

= 4 future surfaces. Use 20-year windows centered on the horizon (standard practice — single years are too noisy).

---

## Part 1 — GEE script (`scripts/gee_future_climatology.js`, user runs manually)

Data source: `NASA/GDDP-CMIP6` in Earth Engine (downscaled, daily, ~25km).

For each (scenario, horizon), and also for the historical reference (1995–2014), compute per-pixel the SAME frequency metrics the baseline used:

| Metric | Definition (must match baseline exactly) |
|---|---|
| flood_days | days/yr with precipitation > 50mm |
| extreme_rain_days | days/yr with precipitation > 100mm |
| heat_days | days/yr with tasmax > 40°C |
| severe_heat_days | days/yr with tasmax > 45°C |
| drought_months | fraction of months with rainfall < 50% of climatological mean |
| wet_bulb_days | days/yr with computed Tw > 28°C (from tasmax + humidity) |

CRITICAL: the thresholds and definitions MUST be identical to the baseline climatology script, or the delta is meaningless. Reuse the exact same threshold values.

Model selection: use an ensemble mean of 3–5 CMIP6 models (e.g. ACCESS-CM2, MPI-ESM1-2-HR, EC-Earth3, MRI-ESM2-0, GFDL-ESM4) rather than a single model — reduces model-specific error. Average the frequencies across models.

Exports (India-clipped, to Drive → user downloads to `data/raw/climatology_future/`):
```
hist_ref_<metric>.tif              # 1995-2014, model historical
ssp245_2030_<metric>.tif
ssp245_2050_<metric>.tif
ssp585_2030_<metric>.tif
ssp585_2050_<metric>.tif
```
(6 metrics × 5 = 30 rasters, all small frequency rasters — manageable.)

Write and save the script. Do NOT run it (user runs in GEE Code Editor, same as baseline).

---

## Part 2 — `scripts/compute_future_days.py` (delta-change)

For each (scenario, horizon), for each hex, for each hazard:

```
model_delta = zonal_mean(model_future_raster, hex) - zonal_mean(hist_ref_raster, hex)
future_days = max(0, observed_baseline_days[hex] + model_delta)
```

Where `observed_baseline_days` comes from the existing baseline day-count columns (the duration engine already stored `<hazard>_days_per_year` per hex).

Output: add columns to the hex data for each scenario × horizon:
```
flood_days_ssp245_2030, flood_days_ssp245_2050,
flood_days_ssp585_2030, flood_days_ssp585_2050,
heat_days_ssp245_2030, ... etc.
```

If a future raster is missing → MOCK MODE (apply a plausible scenario-scaled delta, clearly logged) so the pipeline runs end to end before the user has downloaded everything.

---

## Part 3 — Run the existing risk engine on future days

This is the key reuse. The existing risk pipeline computes hazard from `days_per_year` via occurrence + chronic factors. Run that SAME logic, but with the future day-counts as input.

For each (scenario, horizon):
1. Use `<hazard>_days_<scenario>_<horizon>` as the day-count input
2. Apply the SAME severity formulas, occurrence factors, chronic factors (unchanged)
3. Apply the SAME sensitivity and adaptive capacity (held at present-day values — see note)
4. Produce `<hazard>_hazard_<scenario>_<horizon>` and `risk_<scenario>_<horizon>` per hex

IMPORTANT — what to hold constant vs vary:
- **Vary:** hazard day-counts (the climate changes)
- **Hold at present:** adaptive capacity, sensitivity, population (for v1). This is the honest "if capacity stays as today" baseline — which is exactly what makes the gap analysis meaningful ("where will tomorrow's climate outpace today's coping"). Population projection can be added later; note it as a v1 simplification.

Output: extend hex GeoJSON (or a parallel `india_hex_future.json`) with:
```
risk_present          (already exists)
risk_ssp245_2030
risk_ssp245_2050
risk_ssp585_2030
risk_ssp585_2050
```
Plus the per-hazard future values for drill-down.

---

## Part 4 — Validation (print, don't skip)

The believability checks. Print a table for ~8 hexes across climate zones:

| Hex | heat_days present | heat_days 2050 ssp585 | risk present | risk 2050 ssp585 | sane? |
|---|---|---|---|---|---|
| Jaisalmer (Raj) | ~100 | should RISE (more heat) | … | should rise | ✓ |
| Assam | … | flood_days may rise | … | … | ✓ |
| Kerala | … | … | … | … | ✓ |

Sanity rules to check and flag violations:
1. Heat-days should generally RISE in 2050, more under SSP5-8.5 than SSP2-4.5 (warming is robust).
2. SSP5-8.5 risk ≥ SSP2-4.5 risk for the same horizon (higher emissions = more hazard), almost everywhere.
3. 2050 risk ≥ 2030 risk under the same scenario for temperature-driven hazards.
4. No hex should show physically impossible values (e.g. >365 days, negative days).
5. Rainfall/flood changes are less spatially uniform than heat — some regions wetter, some drier — so flood need NOT rise everywhere. Don't flag that as wrong.

Print any hex violating rules 1–4 as a FLAG for review.

---

## Acceptance criteria

- [ ] `gee_future_climatology.js` written & saved (NOT run); uses NASA/GDDP-CMIP6, ensemble of 3–5 models, SAME thresholds as baseline, exports hist-ref + 4 future sets
- [ ] `compute_future_days.py` applies delta-change correctly: future = observed_baseline + (model_future − model_hist), clamped ≥ 0
- [ ] Future day-count columns added per scenario × horizon
- [ ] Existing risk engine run on future days; severity/occurrence/chronic/sensitivity/AC formulas UNCHANGED
- [ ] AC, sensitivity, population held at present-day values (logged as v1 simplification)
- [ ] 4 future risk surfaces produced: ssp245_2030/2050, ssp585_2030/2050
- [ ] Validation table printed; sanity rules checked; violations flagged
- [ ] MOCK MODE works if future rasters not yet downloaded (pipeline never blocks)
- [ ] Present-day risk and all existing layers UNCHANGED

---

## Rules for Claude Code

1. Delta-change is mandatory — never feed raw CMIP6 absolute values into the thresholds. Always observed_baseline + model_delta.
2. Future frequency definitions MUST exactly match the baseline thresholds, or the delta is meaningless. Reuse the same threshold constants.
3. The risk formula, severity functions, occurrence/chronic factors, sensitivity, and AC are UNCHANGED — this brief only changes the day-count input and adds future columns.
4. Hold AC/sensitivity/population at present values for v1; log this clearly as a simplification.
5. Ensemble of multiple CMIP6 models, not one.
6. MOCK MODE if rasters missing, clearly logged.
7. Print the validation table and flag sanity violations.
8. Do NOT build the gap-analysis page — that's Piece B. Stop after the future risk surfaces + validation table.

---

## What the user does manually

1. Run `gee_future_climatology.js` in GEE Code Editor → download 30 rasters to `data/raw/climatology_future/`
2. Run `compute_future_days.py` then the future risk step
3. Review the validation table

---

## END OF BRIEF
