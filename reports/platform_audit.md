# Platform Audit (Pre-Demo)

**Date:** 2026-07-03  
**Auditor:** Claude Code  
**Scope:** End-to-end functional audit — plumbing, data wiring, feature flag leaks. Science not re-validated.

---

## Inventory

### Routes (19 total)

| Route | Component | Notes |
|-------|-----------|-------|
| `/` | HomePage | Links to /grid, /forecast, /simulator, /risk-map, /adapt, /states |
| `/grid` | HexMapPage | Main hex canvas map — 22 layers, confidence overlay |
| `/simulator` | SimulatorPage | Hex-grid canvas, 4 sliders, 4 presets |
| `/forecast` | ForecastPage | 7-day per-hex early warning |
| `/action-plan` | ActionPlanPage | District WASH action planner |
| `/gap-analysis` | GapAnalysisPage | Present vs 2050 risk gap (has disclaimer) |
| `/report/:district` | ReportPage | Print-friendly district profile |
| `/states` | StateSummaryPage | State-level summary |
| `/risk-map` | RiskMapPage | District choropleth (IPCC AR6) |
| `/methodology` | MethodologyPage | Methodology docs |
| `/adapt` | AdaptPage | Adaptation planner |
| `/dashboard` | Dashboard | Legacy dashboard |
| `/live-data` | LiveDataPage | Live sensor data view |
| `/stress-test` | StressTestPage | Stress test tool |
| `/technology` | TechnologyPage | Technology showcase |
| `/technology/:slug` | TechnologyPage | Technology detail |
| `/admin/login` | AdminLogin | Admin auth |
| `/admin` | AdminDashboard | Admin panel |
| 404 | not-found | Catch-all |

### Data files

| File | Size | Records | Status |
|------|------|---------|--------|
| `india_hex_props.json` | 6.8MB | 12,705 hexes | ✓ All key fields present |
| `district_rankings.json` | — | 713 districts | ✓ dominant_hazard, children_under5_at_risk populated |
| `gap_rankings.json` | — | 713 districts | ⚠️ future_risk max 4.18 (pipeline bug — see issues) |
| `forecast_risk.json` | ~1.7MB | 12,705 hexes × 7 days | ⚠️ Generated 2026-06-24 (9 days old — refresh before demo) |
| `india.json` | ~4MB | 735 district polygons | ✓ |
| `hex_confidence.json` | — | Present | ✓ |
| `india_hex_grid.geojson` | 10MB | Present | ✓ |
| `hex_states/*.json` | ~200KB each | 36 state files | ✓ |
| `india_hex_future.json` | — | Present on disk | ✓ Not referenced by any frontend page |

### Key scripts

| Script | Present |
|--------|---------|
| `scripts/risk/formulas.py` | ✓ |
| `scripts/compute_forecast.py` | ✓ |
| `scripts/join_hex_districts.py` | ✓ |
| `scripts/build_hex_grid.py` | ✓ |

### Reports (reports/)

7 markdown files: `confidence_methodology.md`, `backtest_validation.md`, `district_validation.md`, `data_provenance.md`, `hex_validation.md`, `retrospective_*.md`, plus this file.

---

## Page Functional Tests

| Page | Renders | Features work | 2050 leak | Console | Verdict |
|------|---------|---------------|-----------|---------|---------|
| `/grid` (HexMapPage) | ✓ | ✓ Layer toggles, confidence overlay, peak-season field, CSV export | None | Clean | **PASS** |
| `/simulator` (SimulatorPage) | ✓ | ✓ Hex grid canvas, 4 sliders, 4 presets, U-curve drought/flood | None | Clean | **PASS** |
| `/action-plan` | ✓ | ✓ State ranks, child toggle, schemes, pre-empt gated | None — pre-empt filter correctly hidden | Clean | **PASS** |
| `/forecast` | ✓ | ✓ 7-day structure, 12,705 hexes, 100 alerts, hazard filters | None | Clean | **PASS** |
| `/gap-analysis` | ✓ | ✓ Renders with disclaimer banner | ⚠️ 2050 numbers visible but caveated | Clean | **PASS-CAVEATED** |
| `/report/:district` | ✓ | ✓ 2050 cards gated by SHOW_FUTURE_2050 | None | Clean | **PASS** |
| `/risk-map` | ✓ | No SHOW_FUTURE_2050 refs | None | Clean | **PASS** |
| `/states` | ✓ | No SHOW_FUTURE_2050 refs | None | Clean | **PASS** |
| `/` (HomePage) | ✓ | All nav links resolve to valid routes | None | Clean | **PASS** |
| `/methodology` | ✓ | Static page | None | Clean | **PASS** |
| `/adapt` | ✓ | — | None | Clean | **PASS** |
| `/dashboard` | ✓ | Console.error handlers present (expected) | None | Expected console.error | **PASS** |

---

## Hidden-Feature Leak Check

### 1. 2050/future (SHOW_FUTURE_2050 = false)

| Location | Status |
|----------|--------|
| HexMapPage layer list | ✓ No future layers shown |
| ActionPlanPage "pre-empt" filter tab | ✓ Correctly hidden (lines 320-322: ternary gating) |
| ActionPlanPage sort-by-future dropdown | ✓ Hidden |
| ActionPlanPage pre-empt summary card | ✓ Hidden |
| ReportPage 2050 metric cards | ✓ Hidden (SHOW_FUTURE_2050 gate) |
| GapAnalysisPage | ⚠️ 2050 numbers visible — page shows a banner: *"Preliminary projections — not for planning use. The 2050 future layer is under revision."* Scenario and horizon selectors (SSP2/SSP5, 2030/2050) remain active. |
| StateSummaryPage, Dashboard, RiskMapPage | ✓ No 2050 refs |
| `india_hex_future.json` | ✓ File present on disk but zero frontend imports reference it |

**Decision needed:** GapAnalysisPage is the only page where 2050 numbers are visible. The disclaimer banner is honest, but a technical reviewer will likely notice that `future_risk_ssp585_2050` never exceeds 4.18 while present risk reaches 10.0 — an implausible result that reveals the known CMIP6 pipeline bug. If demoing to a technical audience, consider navigating away from GapAnalysisPage or explaining proactively.

### 2. Landslide (no slope data)

Landslide appears in the layer selector with desc: *"Steep slope + deforestation + monsoon trigger"*. The actual `slope_deg` field is `null` in all hexes — a national default of 3° is used. The confidence layer correctly flags this: landslide gets **LOW** confidence with reason *"Deforestation proxy · slope_deg absent (national default 3° assumed)"*. This is caveated at hex level but not in the layer selector label.  
**Recommendation:** Not blocking, but if a reviewer drills into a landslide-dominated hex, the LOW confidence badge explains it.

### 3. Cyclone (heuristic, no IBTrACS)

Shown as a selectable layer. Confidence layer correctly flags **LOW** with reason *"Coastal distance heuristic · no IBTrACS historical track data used"*. No additional callout in the layer selector.

### 4. J&K "DATA NOT AVAILABLE" hexes

294 hexes have `district_name = "DATA NOT AVAILABLE"` (Jammu & Kashmir). These hexes:
- Render with real `hex_risk` values (e.g., 7.41) and real `population` values
- Display "DATA NOT AVAILABLE" in the hex popup district field
- Are not blank/zero — they contribute to state and national aggregates

This is functional but could confuse a reviewer clicking on a J&K hex and seeing "DATA NOT AVAILABLE" as the district. Not a crash, cosmetically imperfect.

### 5. Debug artifacts

- No `console.log` debug statements in any page file ✓
- No TODO/FIXME visible to users ✓
- No placeholder text in UI ✓

---

## Data Integrity

| Check | Result |
|-------|--------|
| Hex count | 12,705 ✓ |
| `hex_risk` null count | 0 ✓ |
| `state` null count | 0 ✓ |
| `dominant_hazard` field in hex_props | Not stored as field — computed client-side by `getHexDataConfidence()` from hazard scores ✓ |
| `pop_children_under_5` (actual field name) | Present in all hexes ✓ (UI correctly uses this, not `children_under5`) |
| `adaptive_capacity` null count | 831 hexes (6.5%) |
| Churu → Rajasthan | ✓ |
| Banswara → Rajasthan | ✓ |
| Population total | 1.906B (vs 1.42B India actual — ~34% overcount) |
| Future risk max (SSP5-8.5 2050) | 4.18 — implausibly lower than present max 10.0 |
| Forecast age | 9 days old (generated 2026-06-24) |

**Note on null adaptive_capacity (831 hexes):** In JavaScript, `null * dampening = 0`, so `effectiveAc = 0` → `(1 - 0) = 1` → these hexes get no AC reduction applied. This makes them score at maximum hazard × exposure × sensitivity. The behavior is conservative (overestimates risk for these hexes) but not a crash and not misleading in the dangerous direction.

---

## Build / Console Health

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✓ Zero errors |
| `npm run build` | ✓ Succeeds in 6.6s. Chunk size warning (1.8MB JS > 500KB limit) — non-blocking, informational |
| `india_hex_future.json` referenced | ✗ Zero imports — file is inert |
| Debug console.log in pages | ✗ None found |
| 404 data fetches | No dead references to missing files found |

---

## Issues Found

| Severity | Issue | File / Page | Fixed? |
|----------|-------|-------------|--------|
| MEDIUM | GapAnalysisPage shows 2050 future risk numbers (with disclaimer) — future_risk_ssp585_2050 max is 4.18 while present max is 10.0 (CMIP6 pipeline bug). Visible but caveated. | GapAnalysisPage.tsx | No — disclaimer is present; page is explicitly about future gap. Recommend verbal callout if shown to technical reviewers. |
| MEDIUM | 831 hexes (6.5%) have null adaptive_capacity → no AC reduction applied → these hexes score at maximum risk for their hazard/exposure/sensitivity. Conservative but inaccurate. | india_hex_props.json | No — data pipeline fix needed. Not a crash. |
| LOW | Forecast data is 9 days old (generated 2026-06-24). Weather risk shown is stale. | forecast_risk.json | No — run `python scripts/compute_forecast.py` before demo. |
| LOW | Population total 1.906B vs 1.42B India actual (~34% overcount). Affects population-weighted stats. | india_hex_props.json | No — known pipeline issue, not fixed. |
| LOW | CSV export includes `slope_deg` and `dist_water_m` columns which are `null` in all hexes — exported CSV will have empty cells for these. | HexMapPage.tsx:666 | No — cosmetic; data is absent upstream. |
| LOW | 294 J&K hexes show `district_name = "DATA NOT AVAILABLE"` in hex popups. Functional but confusing. | india_hex_props.json | No — upstream data limitation. |

---

## Demo-Readiness Verdict

**READY WITH CAVEATS** — No blocking issues. Build is clean, TypeScript compiles, all primary pages render, all key data files present with correct record counts, SHOW_FUTURE_2050 gating works on all pages except GapAnalysisPage (which has a disclaimer).

### Before demo
1. **Refresh forecast**: `python scripts/compute_forecast.py` — takes ~5 min. Forecast is 9 days stale.
2. **Avoid GapAnalysisPage** or prepare to explain: the 2050 future risk values (max 4.18) are obviously lower than present (max 10.0) due to the known CMIP6 pipeline bug. The disclaimer banner is honest but a technical reviewer will ask. Navigate to GapAnalysisPage only if you can explain proactively.

### During demo
3. For any landslide or cyclone-dominant hex, the confidence badge will show LOW with a short explanation — this is the correct honest behavior.
4. J&K hexes show "DATA NOT AVAILABLE" as district name — clicking one reveals this label. Not a crash but worth knowing.

### What's solid
- HexMapPage, SimulatorPage, ForecastPage, ActionPlanPage, ReportPage all work correctly.
- SHOW_FUTURE_2050=false correctly hides pre-empt tab, 2050 sort options, future metric cards on ReportPage.
- Confidence layer classifies 81.8% HIGH / 6.7% MEDIUM / 11.5% LOW — defensible and explained.
- TypeScript clean. Build succeeds. No debug artifacts.
- Backtest validation documented. State labels correct.
