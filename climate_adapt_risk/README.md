# ClimateAdapt district risk engine — spec & skeleton

A DRR risk model with two extensions over the standard INFORM identity:
ENSO seasonal forcing (Layer A) and biophysical hazard mediation (Layer B).
The core stays INFORM-compatible so it interoperates with INFORM Subnational,
the Sendai monitoring indicators, and NDMA frameworks.

This package is a **skeleton built for a coding agent**. The deterministic math
is fully implemented and tested; everything that requires data or calibration is
a clearly-marked stub. Read `AGENT_INSTRUCTIONS.md` first.

## The formula, layer by layer

```
Layer A  ENSO forcing      X = baseline + beta*ONI + gamma*DMI
Layer B  Effective hazard  H*_drought = D / (S + W + G)
                           H*_flood   = P * (1 - I) * slope
Layer C  Compound          H = Σ w_h H*_h + Σ λ_hh' H*_h H*_h'
Layer D  Risk identity     R = (Ĥ · E · V · (1 - C))^(1/4)
Layer E  Impact lenses     Impact = R · (exposed quantity) · kappa
Layer F  Forward           B_t = B_{t-1} + recharge - draw   (carry-over)
                           L = Σ [φ·Impact + (1-φ)(1-ρ)·Impact]  (irreversible)
```

## Formula → module map

| Layer | Module | Status |
|------|--------|--------|
| A — ENSO forcing (apply) | `forcing.apply_teleconnection` | implemented |
| A — coefficient fit | `forcing.fit_teleconnection` | **stub (needs data)** |
| B — effective hazards | `hazard.py` | implemented |
| C — compound aggregation | `compound.py` | implemented (needs coeffs) |
| D — dimension composites | `dimensions.py` | implemented (needs weights) |
| D — risk identity | `risk.py` | implemented |
| E — impact lenses | `impact.py` | implemented (needs kappa) |
| F — carry-over & loss | `future.py` | implemented (needs phi) |
| coefficients + guard | `config.py` | **placeholders, CALIBRATED=False** |
| I/O contracts | `schemas.py` | implemented |
| orchestration | `pipeline.py` | implemented |

## What is computed vs what must be supplied

- **Computed (the engine / the IP):** effective hazard, compound aggregation,
  normalisation, risk, impact, cumulative loss. Pure functions, deterministic,
  unit-tested.
- **You must supply (evidence, not code):**
  1. Real district data feeding `DistrictInputs` (rainfall, soil, storage,
     groundwater, exposure/vulnerability/capacity sub-indicators).
  2. Calibrated coefficients: `beta/gamma` (regression), `w` and `lambda`
     (PCA / expert elicitation), `phi`, `kappa`.
  3. Validation before trusting outputs (see below).

## Build order for the agent

1. `pytest` — confirm the 14 tests pass as delivered.
2. Implement data ingestion → `DistrictInputs` from PostGIS. Do not mock.
3. Implement `forcing.fit_teleconnection` against real historical records.
4. Replace the placeholders in `config.py` with calibrated values; only then
   set `CALIBRATED = True`.
5. Wire `pipeline.run_district` across all districts (vectorise over a
   GeoDataFrame); persist `DistrictRisk` back to PostGIS.

## The calibration guard

`config.CALIBRATED` is `False` on delivery. `pipeline.run_district` calls
`config.require_calibrated()` and raises unless coefficients are calibrated.
Tests/smoke runs pass `allow_uncalibrated=True`; production must not. This is
the mechanism that stops placeholder numbers from being shipped as real risk.

## Validation target

Before trusting any forward run, back-test `R_d` against the 2015–16 super
El Niño using observed district outcomes (crop loss, disease, DDMA records).
Calibrate coefficients to that event, then validate out-of-sample.

## Run

```bash
pip install -r requirements.txt
pytest -q
```
