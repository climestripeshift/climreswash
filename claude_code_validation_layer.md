# Claude Code Brief — Model Validation Layer

**Goal:** Check whether predicted risk scores actually track real-world health outcomes. The 5 health/nutrition NFHS columns (stunting, wasting, diarrhoea, anaemia, low vaccination) are currently display-only. Use them to VALIDATE the model — never to feed it. This produces a credibility report, not a change to the risk math.

**Critical principle:** These outcomes are checked AGAINST predicted risk, never fed INTO it. The risk formula stays untouched. This avoids circular logic (using an effect to predict the effect).

---

## Scope

ONLY build the validation analysis and report. Do NOT modify the risk formula, the hazard scores, the adaptive capacity computation, or the frontend map. This is a standalone analysis script that reads the existing hex/district data and produces a validation report.

---

## The core idea

Our model predicts risk from inputs (hazard × exposure × sensitivity ÷ adaptive capacity). NFHS-5 gives us real measured health outcomes per district. If the model is sound, predicted risk should correlate with observed outcomes — and crucially, the RIGHT hazard should correlate with the RIGHT outcome:

| Predicted (our model) | Should correlate with (observed NFHS) | Why |
|---|---|---|
| Flood + water risk | Diarrhoea prevalence | Waterborne disease pathway |
| Drought + water stress risk | Stunting, wasting | Food/water insecurity → malnutrition |
| Heat risk | Anaemia | Heat tolerance worse when anaemic; also heat-nutrition link |
| Overall WASH risk | Low vaccination coverage | Weak health systems cluster with weak WASH |
| Overall risk | Composite poor outcomes | General check |

A strong model shows: matched pairs correlate, mismatched pairs don't. That discrimination is the real evidence — much stronger than one blended correlation.

---

## Important caveats the analysis must handle

1. **Aggregate to district level for validation.** Risk is computed per hex; NFHS outcomes are per district. So aggregate hex risk up to district (population-weighted mean) before correlating. Comparing hex-level predictions to district-level outcomes directly would be a units mismatch.

2. **Population-weight the aggregation.** A district's risk = the population-weighted average of its hexes' risk, not a simple mean (a 5-person desert hex shouldn't count as much as a 50,000-person city hex).

3. **Confounders exist.** Health outcomes are driven by many things beyond climate (income, governance, caste, remoteness). So we do NOT expect correlation near 1.0. A correlation of 0.4–0.7 on the matched pairs would be a genuinely good result for a climate-only predictor. State this explicitly in the report so the number isn't misread.

4. **Direction matters.** Higher predicted risk should associate with WORSE outcomes (higher diarrhoea, higher stunting, higher anaemia, LOWER vaccination). Check signs, not just magnitude.

---

## Files to create

```
/scripts/validation/
  validate_model.py          # the analysis
  __init__.py
/reports/
  model_validation_report.md # human-readable output (generated)
  validation_data.csv        # district-level predicted-vs-observed table (generated)
```

Do NOT modify anything outside `/scripts/validation/` and `/reports/`.

---

## What `validate_model.py` does

### Step 1 — Aggregate hex risk to district
- Load the hex GeoJSON (with risk scores + population + district census code).
- For each district (group by census code), compute population-weighted mean of:
  - overall risk
  - each individual hazard's risk (flood_hazard, heat_hazard, drought_hazard, etc.)
- Output: one row per district with predicted risk values.

### Step 2 — Join observed outcomes
- Load NFHS-5 district outcomes (stunting, wasting, diarrhoea, anaemia, vaccination) via census code.
- Merge with the aggregated predictions from Step 1.
- Result: a district table with both predicted risk AND observed outcomes.

### Step 3 — Compute the correlation matrix
- Use Spearman rank correlation (robust to non-linearity and outliers; appropriate here since relationships need not be linear). Also report Pearson for reference.
- Build a matrix: rows = predicted risk variables, columns = observed outcomes.
- For the headline matched pairs, compute and report correlation + p-value + n.

Matched pairs to highlight:
```
flood_hazard / water_risk    vs  diarrhoea_prev_pct      (expect positive)
drought_hazard               vs  children_stunted_pct    (expect positive)
drought_hazard               vs  children_wasted_pct     (expect positive)
heat_hazard                  vs  women_anaemic_pct       (expect positive)
overall_risk                 vs  fully_vaccinated_pct    (expect NEGATIVE)
overall_risk                 vs  diarrhoea_prev_pct      (expect positive)
```

Mismatched pairs to ALSO compute (these should be WEAKER — the discriminant test):
```
heat_hazard                  vs  diarrhoea_prev_pct      (expect weak)
flood_hazard                 vs  women_anaemic_pct       (expect weak)
```

### Step 4 — Discriminant check
- The key evidence: matched pairs should correlate more strongly than mismatched pairs.
- Report: average |correlation| for matched pairs vs average |correlation| for mismatched pairs.
- If matched > mismatched, the model has real signal. If they're similar, the model isn't discriminating between hazards (a warning sign).

### Step 5 — Generate the report
Produce `reports/model_validation_report.md` with:

```
# ClimResWASH Model Validation Report

## Summary
[1-2 sentences: does predicted risk track observed outcomes? matched vs mismatched discrimination?]

## Headline correlations (matched pairs)
| Predicted | Observed | Spearman r | p-value | n | Direction correct? |
[table]

## Discriminant test
- Mean |r| for matched pairs: X.XX
- Mean |r| for mismatched pairs: X.XX
- Interpretation: [model discriminates / does not discriminate between hazards]

## Full correlation matrix
[all predicted x observed]

## Interpretation & caveats
- Correlations of 0.4-0.7 are GOOD for a climate-only predictor — health outcomes have many non-climate drivers (income, governance, caste, remoteness).
- A near-zero or wrong-sign correlation on a matched pair flags a possible model problem in that hazard.
- This is rank correlation across ~700 districts; it tests geographic pattern, not causation.

## Districts where model and reality disagree most
[list 10 districts with largest residual — high predicted risk but good outcomes, or vice versa — these are worth manual investigation]

## Verdict
[Does the model validate? Where is it strong? Where is it weak?]
```

Also write `reports/validation_data.csv` — the full district table (predicted + observed) so the user can do their own analysis.

---

## Acceptance criteria

- [ ] `validate_model.py` runs and produces both output files
- [ ] Hex risk correctly aggregated to district level, population-weighted
- [ ] Correlation computed for all matched and mismatched pairs (Spearman + Pearson)
- [ ] Discriminant test computed (matched vs mismatched average correlation)
- [ ] Report clearly states the 0.4–0.7 "good" interpretation band so numbers aren't misread
- [ ] Direction (sign) of each correlation checked against expectation
- [ ] Top-10 disagreement districts listed for manual review
- [ ] Risk formula and all other code UNCHANGED (diff touches only validation/ and reports/)

---

## Rules for Claude Code

1. Read-only with respect to the model. Touch only `/scripts/validation/` and `/reports/`.
2. Use Spearman as primary (rank-based, robust); report Pearson alongside.
3. Always report n (number of districts) and p-value with every correlation.
4. Handle missing data: districts with missing outcome or missing prediction are dropped from that specific correlation (report how many dropped).
5. Do NOT feed any outcome variable back into the risk computation. This is validation only.
6. State the interpretation band (0.4–0.7 is good for climate-only) prominently so the user doesn't misread a 0.5 as "weak".
7. If a matched pair shows wrong sign or near-zero correlation, flag it explicitly as a possible model issue — don't bury it.

## Dependencies
- Python: pandas, scipy (for correlation), geopandas. If scipy not available, ask before adding.

After producing the report and CSV, print the headline correlation table and the discriminant test result, then stop.

---

## END OF BRIEF
