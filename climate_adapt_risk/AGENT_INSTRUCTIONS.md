# AGENT INSTRUCTIONS — read this before writing any code

You are integrating a quantitative climate-risk model into an existing
codebase (Python + PostGIS + React). This is a scientific model, not a CRUD
app. Code that *runs* is not the goal; code that is *correct* is. Follow these
rules exactly.

## DO
- Treat the modules in `climate_risk/` as the contract. Keep the equations and
  function signatures as written. Wire data and persistence around them.
- Implement data ingestion that populates `schemas.DistrictInputs` from the
  real sources (PostGIS queries / GeoDataFrames), one record per district-season.
- Keep the deterministic math layers (`normalize`, `hazard`, `compound`, `risk`,
  `impact`, `future`) pure and unit-tested. Extend, don't rewrite.
- Run `pytest` after every change. All tests must stay green.
- Leave every `NotImplementedError` and the `CALIBRATED = False` guard in place
  until a human supplies real coefficients.

## DO NOT
- DO NOT invent, guess, hardcode, or "estimate" any coefficient: the
  teleconnection betas/gammas, hazard weights `w`, interaction matrix `lambda`,
  irreversible fraction `phi`, or consequence factors `kappa`. They live in
  `config.py` as flagged PLACEHOLDERS and must be calibrated from data.
- DO NOT implement `forcing.fit_teleconnection` with synthetic data to make it
  pass. It must regress real historical records.
- DO NOT set `config.CALIBRATED = True` to "make the pipeline run." Use
  `allow_uncalibrated=True` only inside tests/smoke runs.
- DO NOT fabricate district data, default values, or mock CSVs and present
  pipeline output as real risk estimates.

## When you hit a placeholder
Stop and surface it to the human as a TODO with the exact data or calibration
needed. A clearly-marked gap is correct; a silently-filled gap is a failure.
