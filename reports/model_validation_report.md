# ClimResWASH Model Validation Report

## Summary

Predicted risk scores were validated against 713 districts of real NFHS-5 health outcomes. Direction was correct for 0/5 matched pairs. Matched pairs show similar correlation than mismatched pairs (avg |r| = 0.077 vs 0.186) — model may not discriminate between hazards.


## Headline correlations (matched pairs)

| Predicted | Observed | Spearman r | p-value | n | Direction? | Interpretation |
|---|---|---|---|---|---|---|
| flood_risk | wash_diarrhoea_pct | 0.080 | 0.0375 | 669 | ✅ | Very weak |
| drought_risk | wash_stunting_pct | 0.065 | 0.0946 | 670 | ✅ | Very weak |
| drought_risk | wash_wasting_pct | N/A | N/A | 0 | — |  |
| heat_risk | wash_anaemia_pct | 0.083 | 0.0313 | 670 | ✅ | Very weak |
| hex_risk | wash_vaccination_pct | -0.130 | 0.0009 | 647 | ✅ | Weak |
| hex_risk | wash_diarrhoea_pct | -0.026 | 0.5051 | 669 | — | Very weak |

## Discriminant test

- Mean |r| for matched pairs: **0.077**
- Mean |r| for mismatched pairs: **0.186**
- ⚠️ Model does NOT discriminate — matched and mismatched pairs show similar strength


## Full correlation matrix

| Predicted \ Observed | wash_stunting_pct | wash_wasting_pct | wash_diarrhoea_pct | wash_anaemia_pct | wash_vaccination_pct |
|---|---|---|---|---|---|
| hex_risk | -0.04 | N/A | -0.03 | -0.28 | -0.13 |
| flood_risk | 0.27 | N/A | 0.08 | -0.22 | -0.32 |
| heat_risk | 0.30 | N/A | 0.15 | 0.08 | -0.12 |
| cyclone_risk | -0.17 | N/A | 0.02 | -0.12 | 0.15 |
| drought_risk | 0.07 | N/A | 0.07 | 0.15 | -0.02 |
| wetbulb_risk | 0.16 | N/A | 0.09 | -0.17 | -0.13 |
| landslide_risk | -0.25 | N/A | -0.14 | -0.16 | 0.11 |
| coldwave_risk | -0.05 | N/A | -0.06 | -0.04 | -0.24 |

## Interpretation & caveats

- Correlations of **0.2–0.5 are reasonable** and **0.4–0.7 are good** for a climate-only predictor. Health outcomes have many non-climate drivers (income, governance, caste, remoteness).
- A near-zero or wrong-sign correlation on a matched pair flags a possible model problem in that hazard.
- This is Spearman rank correlation across ~700 districts; it tests geographic pattern, not causation.
- **Likelihood is in MOCK MODE** — correlations will improve when real 30-year climatology is used.


## Districts where model and reality disagree most

| District | State | hex_risk | Diarrhoea% | Stunting% | Issue |
|---|---|---|---|---|---|
| Leh(Ladakh) | Ladakh | 7.99 | 0.0 | 0.0 | High risk, good outcomes |
| DATA NOT AVAILABLE | Jammu And Kashmir | 7.72 | 0.0 | 0.0 | High risk, good outcomes |
| Chengalputtu | Tamil Nadu | 6.21 | 0.0 | 0.0 | High risk, good outcomes |
| Shi Yomi | Arunachal Pradesh | 5.36 | 0.0 | 0.0 | High risk, good outcomes |
| Mayiladuthurai | Puducherry | 4.75 | 0.0 | 0.0 | High risk, good outcomes |
| Sipahijula | Tripura | 4.33 | 0.0 | 0.0 | High risk, good outcomes |
| Jiribam | Manipur | 4.28 | 0.0 | 0.0 | High risk, good outcomes |
| Khawzawl | Mizoram | 4.27 | 0.0 | 0.0 | High risk, good outcomes |
| Alipurduar | West Bengal | 4.19 | 0.0 | 0.0 | High risk, good outcomes |
| Karbi Anglong East | Nagaland | 4.10 | 0.0 | 0.0 | High risk, good outcomes |

## Verdict

❌ **Validation concerns.** Directions wrong for multiple matched pairs. The model may need recalibration or better likelihood data.

---
*Generated from 713 districts, 12705 hexes. Likelihood in MOCK MODE — re-run after GEE climatology export for definitive results.*
