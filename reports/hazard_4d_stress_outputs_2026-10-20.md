# Hazard 4-D stress outputs (2026-10-20)

What each hazard produces under each stress level, counted as **people and children exposed**, the way the DRR frameworks in `DRR_RISK_FORMULA_REFERENCES.md` report exposure (INFORM and UNICEF CCRI: absolute number and share; ThinkHazard: High and Medium classes). Generated from the saved 4-D summaries by `scripts/hazard_4d_stress_report.py`; no recomputation.

**How to read it.**
- *Stress level* = baseline (1991–2020) or an IPCC AR6 scenario at a horizon (2030 = 2021–2040, 2050 = 2041–2060, 2080 = 2081–2100). Warming per level is in `HAZARD_4D_CALCULATIONS.md` §3.3.
- *High or extreme* = hazard score ≥ 5; *moderate or above* = score ≥ 2.5. The bands are generic, not tuned per hazard (A16), so people counts are **not comparable across hazards**: use them to compare stress levels *within* one hazard.
- *Worst month* = each hex's own worst calendar month; a person is counted once even if exposed in several months.
- People and children are from the hex grid (WorldPop 2020, children under 5 from Census age ratios): the grid holds about 1,224 million people, about 10 % fewer than the 1,354 million in `BASE_LAYERS.md` (D8). Hexes with no estimate are excluded and the covered share is shown.
- Scores are **hazard only** (no vulnerability or capacity) and are not validated against observed events (`HAZARD_4D_CALCULATIONS.md` §8).

## Heat wave

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 2.01 | 7.6 | 0.6 | 0.7 | 521.6 |
| SSP1-2.6 2030 | 2.81 | 91.8 | 7.5 | 8.6 | 735.2 |
| SSP1-2.6 2050 | 3.04 | 160.0 | 13.1 | 15.0 | 771.8 |
| SSP1-2.6 2080 | 3.15 | 196.7 | 16.1 | 18.5 | 795.3 |
| SSP2-4.5 2030 | 2.81 | 91.8 | 7.5 | 8.6 | 735.2 |
| SSP2-4.5 2050 | 3.51 | 326.0 | 26.6 | 30.6 | 865.9 |
| SSP2-4.5 2080 | 4.56 | 594.0 | 48.5 | 55.8 | 1,005.9 |
| SSP3-7.0 2030 | 2.81 | 91.8 | 7.5 | 8.6 | 735.2 |
| SSP3-7.0 2050 | 3.63 | 362.7 | 29.6 | 34.1 | 881.4 |
| SSP3-7.0 2080 | 6.15 | 865.5 | 70.7 | 81.4 | 1,121.4 |
| SSP5-8.5 2030 | 2.92 | 125.8 | 10.3 | 11.8 | 755.4 |
| SSP5-8.5 2050 | 4.02 | 469.1 | 38.3 | 44.1 | 943.7 |
| SSP5-8.5 2080 | 7.33 | 1,026.9 | 83.9 | 96.5 | 1,153.5 |

Peak calendar month for people in high/extreme: baseline **May** (7.6 M), SSP5-8.5 2080 **May** (976.7 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| Uttar Pradesh | 0.0 | 98.0 | 98.0 | 9.21 |
| Madhya Pradesh | 0.0 | 67.7 | 67.7 | 6.36 |
| Rajasthan | 0.1 | 65.2 | 65.1 | 6.13 |
| Maharashtra | 3.1 | 58.3 | 55.2 | 5.48 |
| Gujarat | 4.0 | 37.9 | 33.9 | 3.56 |
| Haryana | 0.0 | 21.3 | 21.3 | 2.00 |
| Chhattisgarh | 0.0 | 18.7 | 18.7 | 1.76 |
| Telangana | 0.0 | 17.8 | 17.8 | 1.68 |

## Flood

Note: Hexes without recorded heavy-rain days (J&K, Ladakh, 2 in Arunachal) show the river-flood part only: a lower bound.

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 5.44 | 655.8 | 53.6 | 61.6 | 1,014.8 |
| SSP1-2.6 2030 | 5.62 | 681.5 | 55.7 | 64.1 | 1,027.9 |
| SSP1-2.6 2050 | 5.67 | 690.5 | 56.4 | 64.9 | 1,032.3 |
| SSP1-2.6 2080 | 5.70 | 694.2 | 56.7 | 65.3 | 1,033.1 |
| SSP2-4.5 2030 | 5.62 | 681.5 | 55.7 | 64.1 | 1,027.9 |
| SSP2-4.5 2050 | 5.75 | 702.6 | 57.4 | 66.0 | 1,036.2 |
| SSP2-4.5 2080 | 5.92 | 726.1 | 59.3 | 68.3 | 1,052.7 |
| SSP3-7.0 2030 | 5.62 | 681.5 | 55.7 | 64.1 | 1,027.9 |
| SSP3-7.0 2050 | 5.78 | 706.8 | 57.7 | 66.4 | 1,040.1 |
| SSP3-7.0 2080 | 6.13 | 753.4 | 61.5 | 70.8 | 1,072.4 |
| SSP5-8.5 2030 | 5.65 | 687.5 | 56.2 | 64.6 | 1,028.7 |
| SSP5-8.5 2050 | 5.85 | 716.7 | 58.5 | 67.4 | 1,047.4 |
| SSP5-8.5 2080 | 6.30 | 780.3 | 63.7 | 73.3 | 1,081.9 |

Peak calendar month for people in high/extreme: baseline **Jul** (611.4 M), SSP5-8.5 2080 **Jul** (733.6 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| Madhya Pradesh | 22.9 | 34.4 | 11.5 | 3.23 |
| Uttar Pradesh | 152.7 | 162.7 | 10.1 | 15.30 |
| Rajasthan | 14.8 | 20.3 | 5.5 | 1.91 |
| Maharashtra | 46.0 | 50.8 | 4.9 | 4.78 |
| Tamil Nadu | 31.2 | 35.1 | 3.9 | 3.30 |
| Gujarat | 55.7 | 59.2 | 3.5 | 5.56 |
| NCT of Delhi | 4.1 | 6.8 | 2.8 | 0.64 |
| Chhattisgarh | 4.7 | 7.3 | 2.7 | 0.69 |

## Drought

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 4.88 | 501.4 | 40.9 | 47.1 | 1,224.0 |
| SSP1-2.6 2030 | 5.08 | 589.8 | 48.2 | 55.4 | 1,224.2 |
| SSP1-2.6 2050 | 5.14 | 626.5 | 51.2 | 58.9 | 1,224.2 |
| SSP1-2.6 2080 | 5.17 | 640.0 | 52.3 | 60.2 | 1,224.2 |
| SSP2-4.5 2030 | 5.08 | 589.8 | 48.2 | 55.4 | 1,224.2 |
| SSP2-4.5 2050 | 5.23 | 665.0 | 54.3 | 62.5 | 1,224.4 |
| SSP2-4.5 2080 | 5.45 | 747.3 | 61.0 | 70.2 | 1,224.4 |
| SSP3-7.0 2030 | 5.08 | 589.8 | 48.2 | 55.4 | 1,224.2 |
| SSP3-7.0 2050 | 5.27 | 676.1 | 55.2 | 63.6 | 1,224.4 |
| SSP3-7.0 2080 | 5.72 | 873.5 | 71.3 | 82.1 | 1,224.4 |
| SSP5-8.5 2030 | 5.11 | 604.6 | 49.4 | 56.8 | 1,224.2 |
| SSP5-8.5 2050 | 5.36 | 707.2 | 57.8 | 66.5 | 1,224.4 |
| SSP5-8.5 2080 | 5.95 | 980.7 | 80.1 | 92.2 | 1,224.4 |

Peak calendar month for people in high/extreme: baseline **Aug** (369.4 M), SSP5-8.5 2080 **Aug** (831.7 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| Uttar Pradesh | 80.0 | 148.1 | 68.1 | 13.92 |
| Maharashtra | 34.5 | 64.7 | 30.3 | 6.09 |
| Karnataka | 29.8 | 50.0 | 20.2 | 4.70 |
| Madhya Pradesh | 39.6 | 54.0 | 14.4 | 5.08 |
| Telangana | 20.0 | 32.3 | 12.4 | 3.04 |
| NCT of Delhi | 4.8 | 15.4 | 10.5 | 1.45 |
| Tamil Nadu | 56.9 | 65.3 | 8.5 | 6.14 |
| Andhra Pradesh | 37.1 | 45.1 | 8.0 | 4.24 |

## Wet-bulb (humid heat)

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 1.21 | 0.0 | 0.0 | 0.0 | 197.7 |
| SSP1-2.6 2030 | 1.80 | 0.0 | 0.0 | 0.0 | 533.7 |
| SSP1-2.6 2050 | 2.00 | 0.0 | 0.0 | 0.0 | 568.4 |
| SSP1-2.6 2080 | 2.10 | 0.0 | 0.0 | 0.0 | 582.7 |
| SSP2-4.5 2030 | 1.80 | 0.0 | 0.0 | 0.0 | 533.7 |
| SSP2-4.5 2050 | 2.31 | 0.0 | 0.0 | 0.0 | 630.6 |
| SSP2-4.5 2080 | 3.08 | 153.9 | 12.6 | 14.5 | 808.2 |
| SSP3-7.0 2030 | 1.80 | 0.0 | 0.0 | 0.0 | 533.7 |
| SSP3-7.0 2050 | 2.42 | 0.0 | 0.0 | 0.0 | 668.7 |
| SSP3-7.0 2080 | 4.14 | 562.5 | 45.9 | 52.9 | 954.5 |
| SSP5-8.5 2030 | 1.90 | 0.0 | 0.0 | 0.0 | 552.2 |
| SSP5-8.5 2050 | 2.74 | 0.5 | 0.0 | 0.0 | 747.9 |
| SSP5-8.5 2080 | 5.13 | 758.6 | 62.0 | 71.3 | 1,044.3 |

Peak calendar month for people in high/extreme: baseline **Jan** (0.0 M), SSP5-8.5 2080 **Jul** (679.0 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| West Bengal | 0.0 | 0.4 | 0.4 | 0.04 |
| Odisha | 0.0 | 0.1 | 0.1 | 0.01 |
| Uttarakhand | 0.0 | 0.0 | 0.0 | 0.00 |
| Uttar Pradesh | 0.0 | 0.0 | 0.0 | 0.00 |
| Tripura | 0.0 | 0.0 | 0.0 | 0.00 |
| Telangana | 0.0 | 0.0 | 0.0 | 0.00 |
| Tamil Nadu | 0.0 | 0.0 | 0.0 | 0.00 |
| Sikkim | 0.0 | 0.0 | 0.0 | 0.00 |

## Landslide

Coverage: 94.7 % of hexes, 99.3 % of people have an estimate (1,216 of 1,224 million people).

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 0.22 | 1.1 | 0.1 | 0.1 | 32.9 |
| SSP1-2.6 2030 | 0.23 | 1.3 | 0.1 | 0.1 | 34.9 |
| SSP1-2.6 2050 | 0.24 | 1.3 | 0.1 | 0.1 | 35.1 |
| SSP1-2.6 2080 | 0.24 | 1.3 | 0.1 | 0.1 | 35.3 |
| SSP2-4.5 2030 | 0.23 | 1.3 | 0.1 | 0.1 | 34.9 |
| SSP2-4.5 2050 | 0.24 | 1.3 | 0.1 | 0.1 | 35.9 |
| SSP2-4.5 2080 | 0.25 | 1.4 | 0.1 | 0.1 | 38.5 |
| SSP3-7.0 2030 | 0.23 | 1.3 | 0.1 | 0.1 | 34.9 |
| SSP3-7.0 2050 | 0.24 | 1.3 | 0.1 | 0.1 | 36.3 |
| SSP3-7.0 2080 | 0.26 | 1.4 | 0.1 | 0.1 | 40.1 |
| SSP5-8.5 2030 | 0.23 | 1.3 | 0.1 | 0.1 | 35.0 |
| SSP5-8.5 2050 | 0.24 | 1.4 | 0.1 | 0.1 | 37.0 |
| SSP5-8.5 2080 | 0.26 | 1.5 | 0.1 | 0.1 | 42.3 |

Peak calendar month for people in high/extreme: baseline **Jul** (1.1 M), SSP5-8.5 2080 **Jul** (1.5 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| West Bengal | 0.0 | 0.1 | 0.1 | 0.01 |
| Maharashtra | 0.7 | 0.7 | 0.0 | 0.07 |
| Sikkim | 0.0 | 0.1 | 0.0 | 0.01 |
| Rajasthan | 0.0 | 0.0 | 0.0 | 0.00 |
| Uttarakhand | 0.0 | 0.0 | 0.0 | 0.00 |
| Uttar Pradesh | 0.0 | 0.0 | 0.0 | 0.00 |
| Tripura | 0.0 | 0.0 | 0.0 | 0.00 |
| Telangana | 0.0 | 0.0 | 0.0 | 0.00 |

## Flash flood

Coverage: 94.7 % of hexes, 99.3 % of people have an estimate (1,216 of 1,224 million people).

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 1.00 | 35.3 | 2.9 | 3.3 | 138.3 |
| SSP1-2.6 2030 | 1.03 | 35.6 | 2.9 | 3.3 | 141.6 |
| SSP1-2.6 2050 | 1.04 | 35.7 | 2.9 | 3.4 | 143.5 |
| SSP1-2.6 2080 | 1.05 | 35.7 | 2.9 | 3.4 | 144.1 |
| SSP2-4.5 2030 | 1.03 | 35.6 | 2.9 | 3.3 | 141.6 |
| SSP2-4.5 2050 | 1.06 | 35.9 | 3.0 | 3.4 | 146.2 |
| SSP2-4.5 2080 | 1.09 | 39.1 | 3.2 | 3.7 | 151.3 |
| SSP3-7.0 2030 | 1.03 | 35.6 | 2.9 | 3.3 | 141.6 |
| SSP3-7.0 2050 | 1.06 | 35.9 | 3.0 | 3.4 | 147.0 |
| SSP3-7.0 2080 | 1.13 | 39.8 | 3.3 | 3.7 | 157.0 |
| SSP5-8.5 2030 | 1.04 | 35.6 | 2.9 | 3.3 | 142.2 |
| SSP5-8.5 2050 | 1.08 | 37.9 | 3.1 | 3.6 | 149.4 |
| SSP5-8.5 2080 | 1.16 | 40.3 | 3.3 | 3.8 | 160.5 |

Peak calendar month for people in high/extreme: baseline **Jul** (34.4 M), SSP5-8.5 2080 **Jul** (39.9 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| Uttarakhand | 0.3 | 1.6 | 1.3 | 0.15 |
| Kerala | 3.3 | 4.0 | 0.6 | 0.37 |
| Maharashtra | 26.0 | 26.2 | 0.2 | 2.46 |
| Madhya Pradesh | 0.3 | 0.4 | 0.1 | 0.04 |
| Assam | 0.5 | 0.6 | 0.1 | 0.05 |
| Gujarat | 0.8 | 0.9 | 0.1 | 0.08 |
| Meghalaya | 0.4 | 0.5 | 0.1 | 0.05 |
| West Bengal | 0.3 | 0.4 | 0.1 | 0.04 |

## Cold wave

### People and children exposed, worst month per hex

| Stress level | Mean score | People high/extreme (M) | % of people | Children <5 high/extreme (M) | People moderate or above (M) |
|---|---:|---:|---:|---:|---:|
| Baseline 1991–2020 | 2.27 | 209.0 | 17.1 | 19.6 | 556.4 |
| SSP1-2.6 2030 | 1.89 | 87.2 | 7.1 | 8.2 | 482.0 |
| SSP1-2.6 2050 | 1.78 | 70.6 | 5.8 | 6.6 | 459.4 |
| SSP1-2.6 2080 | 1.72 | 66.6 | 5.4 | 6.3 | 441.1 |
| SSP2-4.5 2030 | 1.89 | 87.2 | 7.1 | 8.2 | 482.0 |
| SSP2-4.5 2050 | 1.61 | 56.7 | 4.6 | 5.3 | 402.5 |
| SSP2-4.5 2080 | 1.25 | 29.4 | 2.4 | 2.8 | 294.5 |
| SSP3-7.0 2030 | 1.89 | 87.2 | 7.1 | 8.2 | 482.0 |
| SSP3-7.0 2050 | 1.56 | 52.9 | 4.3 | 5.0 | 376.8 |
| SSP3-7.0 2080 | 0.83 | 14.3 | 1.2 | 1.3 | 166.8 |
| SSP5-8.5 2030 | 1.83 | 76.1 | 6.2 | 7.2 | 469.8 |
| SSP5-8.5 2050 | 1.40 | 40.7 | 3.3 | 3.8 | 332.6 |
| SSP5-8.5 2080 | 0.53 | 10.5 | 0.9 | 1.0 | 61.5 |

Peak calendar month for people in high/extreme: baseline **Jan** (209.0 M), SSP5-8.5 2080 **Jan** (10.5 M).

### States with the largest increase in people exposed, baseline to SSP5-8.5 2050

| State | Baseline (M) | SSP5-8.5 2050 (M) | Increase (M) | Children <5 at SSP5-8.5 2050 (M) |
|---|---:|---:|---:|---:|
| Tripura | 0.0 | 0.0 | 0.0 | 0.00 |
| Telangana | 0.0 | 0.0 | 0.0 | 0.00 |
| Tamil Nadu | 0.0 | 0.0 | 0.0 | 0.00 |
| Sikkim | 0.0 | 0.0 | 0.0 | 0.00 |
| Puducherry | 0.0 | 0.0 | 0.0 | 0.00 |
| Odisha | 0.0 | 0.0 | 0.0 | 0.00 |
| Maharashtra | 0.0 | 0.0 | 0.0 | 0.00 |
| Ladakh | 0.4 | 0.4 | 0.0 | 0.03 |

## Caveats shared by every table

1. Scenario warming is the approximate, spatially uniform AR6-derived table (A1, A2); results move with it.
2. Hazard bands are generic (A16); the counts answer "how many people are in the worst fifth of this hazard's scale", not "how many are harmed".
3. No return-period classes beyond the 10-year storm (flood, landslide, flash flood) and the 1-in-10 dry window (drought): the DRR practice of 10/50/1000-year classes (ThinkHazard) and the 50-year basis used by UNICEF CCRI are not yet implemented.
4. No vulnerability or coping-capacity dimension: these are hazard-and-exposure outputs only (INFORM's "Hazard & Exposure" dimension, not the risk index).
5. Counts use a fixed 2020 population; future population growth is not applied, so exposure under future stress is understated for growing areas.
