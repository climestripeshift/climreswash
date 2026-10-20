# `/grid` Heat 4-D audit — 19 October 2026

**Verdict: changes required.** The data and controls load, but normal use of Heat 4-D leaves the map grey or showing stale scores. Scenario/month changes also leave existing cross-filter results stale. No application code was changed during this audit.

Tested the frontend alone with `npx vite dev --port 5000 --host 127.0.0.1`, at `http://127.0.0.1:5000/grid`, using headless Chrome at 1440 × 1000. No database or backend was started. Inspected rendered screenshots, network responses, current React feature data and the actual Leaflet feature objects/colours to distinguish data-loading failures from rendering failures.

## Findings

### 1. P1 — Heat 4-D does not refresh the Leaflet features, colours or cross-filter membership

**Location:** `client/src/pages/HexMapPage.tsx:1952–1979`; data merge at lines 2212–2219.

**Reproduce:** open `/grid`, expand Climate Hazards, select Heat 4-D, then select May. The index and baseline files return HTTP 200 and the summary updates, but all 12,705 hexes render as the neutral no-data colour `#e2e8f0`. Switching to July/August or SSP5-8.5 → 2080 still leaves the map grey.

The React feature data contains the correct values. A sampled Nagpur hex (`8560968ffffffff`) has 5.1 in baseline May, 0 in July/August and 9.8 in SSP5-8.5/2080/May. None of the 12,705 existing Leaflet features initially contains `heat4d_score`.

Selecting a state or district reconstructs the GeoJSON layer and makes the colours appear. Subsequent month/scenario/horizon changes retain the reconstructed layer's old values. For example, a Jaisalmer hex remains dark red at 9.8 after its current August score becomes 6.0.

**Cross-filter consequence:** select Rajasthan → Jaisalmer, SSP5-8.5/2080/August and Heat 4-D ≥5: 86 hexes appear correctly. Switch the scenario to baseline: current data has **zero** qualifying Jaisalmer hexes, but all 86 remain visible.

**Cause:** the GeoJSON key includes location and cross-filter settings, but omits Heat 4-D data/selection changes. The existing Leaflet layer retains its original feature properties. The style callback/effect also does not depend on the new feature data; restyling the original features alone would still read stale properties.

**Recommendation:** explicitly replace/synchronize GeoJSON features when the merged data changes, or remount the GeoJSON layer for relevant data/selection revisions. Reapply current filtering, styles, tooltips and click handlers together. Verify the first asynchronous load as well as subsequent changes.

Evidence: [grey baseline May](heat_4d_audit_2026-10-19/baseline-may.png), [stale cross-filter result](heat_4d_audit_2026-10-19/crossfilter-after-scenario-change.png), [browser measurements](heat_4d_audit_2026-10-19/browser-results.json).

### 2. P2 — The default “Hottest month (per hex)” summary aggregates the wrong quantity

**Location:** `client/src/pages/HexMapPage.tsx:913–914`.

The map selects each hex's own maximum across 12 months. The summary instead takes the maximum of the 12 national monthly means and percentages. These operations produce different results.

| Scenario | Displayed mean / population ≥5 | Correct per-hex hottest-month aggregate |
|---|---:|---:|
| Baseline | 1.99 / 1.8% | 2.05 / 2.4% |
| SSP5-8.5, 2080 | 6.84 / 76.6% | 7.07 / 80.4% |

**Recommendation:** calculate population-weighted aggregates after taking each hex's maximum, and persist these alongside monthly aggregates or calculate them from the selected score file. Explicit calendar-month summaries are correct to the stored rounding precision.

Evidence: [independently recomputed aggregates](heat_4d_audit_2026-10-19/data-results.json).

### 3. P2 — Hover tooltips retain the previously selected layer's score

**Location:** `client/src/pages/HexMapPage.tsx:1961–1967`.

Tooltips are bound when each Leaflet feature is created and are not rebound when the active attribute changes. Initially, the grey Heat 4-D map showed a sampled Nagpur tooltip of 4.25 from the initial risk layer. After reconstructing the map under SSP5-8.5/2080/May, switching to Heatwave Annual and Peak season changed colours but left its tooltip at **9.8**, the Heat 4-D value.

This is an existing layer-lifecycle weakness exposed by the new layer; attribution to this change alone is not established. Update tooltips and click feature properties whenever the layer/data changes, alongside finding 1.

### 4. P2 — Supplemental shared-formula gap: the simulator retains the old heat cap

**Locations:** `scripts/risk/formulas.py:59–95` and `client/src/lib/simulatorFormulas.ts:87–97`.

Python now soft-compresses scores above 8; the TypeScript formula used by `SimulatorPage.tsx` still hard-caps at 10. For identical inputs `(47, 40, 5, 30, 15, 2000)`, Python returns **8.643442**, while the actual TypeScript function returns **8.776394**. This is a calculation difference even though the simulator's UI was not changed.

The existing golden parity test passes: its supplied heat vectors miss a material difference near the soft knee, and its strongly saturated vector differs by less than its 0.0001 tolerance. Align the formula implementations if parity remains the intended contract, and add a near-knee vector to the existing parity fixtures.

## Requested checks

| Check | Result |
|---|---|
| Layer placement and feature flag independence | Pass: Climate Hazards, immediately after Heatwave; available while Future Projections is hidden. |
| Scenario options | Pass: baseline and all four SSPs. |
| Horizon options | Pass: 2030, 2050, 2080; disabled for baseline. Visually it lacks clear disabled styling and looks similar to enabled controls. |
| Month options | Pass: Hottest month (per hex), Jan–Dec. |
| Baseline May regional pattern | Correct once the layer is reconstructed; fails in the normal initial interaction because the map stays grey. |
| Baseline July/August regional pattern | Data is predominantly low/green; monthly national means are 0.07 and 0.05, with 0.0% population ≥5. Normal map switching fails under finding 1. |
| SSP5-8.5/2080/May | Correct red/dark-red north/centre after reconstruction; normal scenario switching fails under finding 1. |
| Network | Pass: index, baseline, SSP5-8.5/2050 and /2080 files returned HTTP 200. Previously fetched combinations are cached, so repeat visits need not generate another request. |
| Summary changes with scenario/horizon/month | Pass for calendar months: May baseline 1.99/10, 1.8%; SSP5-8.5/2050 3.78/10, 36.0%, +1.7°C; /2080 6.84/10, 76.6%, +4°C. Default hottest-month calculation fails under finding 2. Baseline omits the +0°C warming clause. |
| Fixed legend | Pass: 0.00–10.00 throughout Heat 4-D selections. |
| Existing Heatwave Annual/Peak season | Both recolour, and returning to Annual restores its colours. Hover values fail under finding 3. |
| State/district filters | Pass: Rajasthan gives 1,352 hexes; Jaisalmer gives 152. |
| Cross-filters | Applying/editing/clearing a filter works; changing Heat 4-D data while a filter remains applied fails under finding 1. |
| Browser runtime errors / data 404s | None during the successful-data audit. |

The Heat 4-D queries do not expose loading/error feedback and do not check `response.ok` before parsing JSON (`HexMapPage.tsx:2117–2127`). This is a source-review robustness observation; missing-file/network-failure behaviour was not deliberately injected. A visible disabled style and an explicit baseline +0°C clause would also bring the controls/text closer to the stated acceptance criteria.

## Spot values

Sampled the H3 resolution-5 cell containing the stated city's central coordinates. Values are baseline May scores out of 10.

| Place | Result | Expected |
|---|---:|---:|
| Delhi | 3.1 | About 3.1 |
| Nagpur | 4.9 | About 5.1 |
| Jaisalmer | 4.3 | About 4.3 |
| Mumbai | 0 | 0 |
| Shimla | 0 | 0 |

Nagpur has a location-dependent difference: the sampled Nagpur-district hex `8560968ffffffff` scores exactly 5.1, while the central-coordinate cell `85609613fffffff` scores 4.9. This does not indicate a dataset defect.

All 13 scenario/horizon score files contain 12,705 valid rows of 12 integer scores within 0–100, with complete unique ID coverage matching the hex properties. Monthly population aggregates agree with independent recomputation within their rounding precision.

## Validation and limits

- `python3 scripts/backtest_events.py`: all five disaster events pass, including both Amphan locations. Delhi heatwave risk is 6.59/10. [Full output](heat_4d_audit_2026-10-19/backtests.txt).
- Existing formula and base-layer suites: **38 passed**. Used a temporary Python environment because the supplied interpreters lacked pytest; installed pytest and h3 there. [Output](heat_4d_audit_2026-10-19/formula-base-tests.txt).
- Existing golden Python/TypeScript parity suite: **1 passed**, with the coverage limitation described in finding 4.
- `npx tsc --noEmit`: exactly **four TS2802 errors**, all in `server/beta/demo.ts`, lines 79, 114, 152 and 161. No reported errors in the Heat 4-D page. [Output](heat_4d_audit_2026-10-19/typescript.txt).
- Reviewed forecast and risk-rebuild call sites: the new `warming_c=0.0` default preserves their call signatures. The forecast pipeline and full `join_hex_districts.py` rebuild were not executed; fresh external weather ingestion and regenerated release outputs are outside this frontend audit's validation. Risk-engine behaviour was exercised through the existing tests and backtests.
- Other routes were not browser-audited. Desktop Chrome was tested; mobile, other browsers and accessibility were not exhaustively audited.

The regional screenshots named `regional-*` in the [evidence directory](heat_4d_audit_2026-10-19/) use state-filter reconstruction to work around finding 1. They demonstrate the underlying data, not a passing normal interaction. The frontend remains available at `http://127.0.0.1:5000/grid` for local review.
