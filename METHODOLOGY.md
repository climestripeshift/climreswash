# ClimResWASH — Climate Risk Methodology

**Version:** v1 (Multi-Hazard Compound-Risk Model)  
**Last updated:** 2026-06  
**Applies to:** 2050 Climate Stress Test page (`/stress-test`)

---

## 1. Overview

ClimResWASH computes forward-looking climate risk scores for ~2,500 districts across India and 13 other countries using two complementary models:

| Model | Hazards | Table | Status |
|---|---|---|---|
| **3-Hazard (v0)** | Heat, Drought, Flood | `vulnerability_projections` | Production |
| **8-Hazard Compound (v1)** | + Riverine Flood, Flash Flood, Cyclone, Landslide, Cold Wave, Dust Storm | `multi_hazard_projections` | Production |

Both use the IPCC AR6 risk framework:

```
Risk = Hazard × Exposure × Vulnerability
```

expanded as:

```
Risk(h, d, s, y) = L(h, d) × [1 + ΔL(h, s, y)]
                 × H(h, d) × [1 + ΔH(h, s, y)]
                 × S(h, d)
                 × V(d)
```

where:

| Symbol | Name | Definition |
|---|---|---|
| `h` | Hazard | One of 8 hazard types |
| `d` | District | Unit of analysis |
| `s` | Scenario | `current_policies` / `ndc` / `net_zero_2050` |
| `y` | Horizon year | 2025, 2030, 2040, 2050 |
| `L` | Likelihood | Annual probability of occurrence (state-level) |
| `ΔL` | Likelihood delta | AR6-based fractional increase in frequency |
| `H` | Hazard intensity | NDMA baseline hazard score (india.json) |
| `ΔH` | Intensity delta | AR6 WG1 Ch.11–12 scenario delta |
| `S` | Severity | WASH/health impact magnitude (indicator-weighted) |
| `V` | Vulnerability | Sensitivity × (1 − Adaptive Capacity) |

---

## 2. Scenario Mapping

| UI Label | NGFS Scenario | CMIP6 Pathway | ~2100 Warming |
|---|---|---|---|
| Current Policies | No new action | SSP5-8.5 | ~3–4°C |
| NDCs | Paris pledges | SSP2-4.5 | ~2.5°C |
| Net Zero 2050 | Strong decarbonisation | SSP1-2.6 | ~1.5°C |

---

## 3. Hazard Taxonomy (8 Hazards)

| ID | Label | Category | Geographic Scope |
|---|---|---|---|
| `heat` | Extreme Heat | Meteorological | Pan-India |
| `drought` | Drought | Meteorological | Pan-India |
| `flood_river` | Riverine Flood | Hydrological | Pan-India |
| `flood_flash` | Flash Flood | Hydrological | Pan-India (boosted in hilly states) |
| `cyclone` | Cyclone | Meteorological | Coastal states (12) |
| `landslide` | Landslide | Geomorphological | Himalayan + NE + Western Ghats (15 states) |
| `cold_wave` | Cold Wave | Meteorological | Northern plains + Himalayan (15 states) |
| `dust_storm` | Dust Storm | Meteorological | Arid northwest (9 states) |

Districts in states outside a hazard's geographic scope receive a background likelihood of **0.02** (near-zero).

---

## 4. Likelihood (L)

State-level annual occurrence probability sourced from:
- **NDMA (2019)** National Disaster Risk Reduction Plan
- **IMD historical records (1950–2020)**: heat days, drought years
- **CWC Flood Atlas (2018)**: flood frequency
- Expert elicitation for NE states and UTs

For new hazards (cyclone, landslide, cold_wave, dust_storm), per-state values are in `server/multiHazardConfig.ts → LIKELIHOOD_NEW`.

`flood_river = flood × 0.60`; `flood_flash = flood × 0.40` (plus ×1.5 boost for hilly states, capped at 0.95).

### Likelihood Deltas (ΔL)

AR6 WG1 Ch.11 frequency-of-extremes projections for South Asia:

| Hazard | SSP5-8.5 2050 | SSP2-4.5 2050 | SSP1-2.6 2050 |
|---|---|---|---|
| Heat | +35% | +20% | +8% |
| Drought | +22% | +14% | +5% |
| Flood | +20% | +13% | +6% |
| Cyclone | +18% | +13% | +6% |
| Landslide | +20% | +13% | +6% |
| Cold Wave | −18% | −10% | −4% |
| Dust Storm | +22% | +14% | +5% |

---

## 5. Hazard Intensity Baseline (H)

`H(h, d)` uses the district's `hazardScore` field, populated from the NDMA composite hazard index in `india.json` (range 0.02–0.52, field `HAZARD`). Run `npm run fix:district-hazards` to populate.

Districts in a hazard's geographic scope receive `H × 1.0`; districts outside receive `H × 0` (geographic scope factor).

### Intensity Deltas (ΔH)

AR6 WG1 Ch.11–12 South Asia regional projections:

| Hazard | SSP5-8.5 2050 | SSP2-4.5 2050 | SSP1-2.6 2050 |
|---|---|---|---|
| Heat | +35% | +20% | +8% |
| Drought | +25% | +15% | +5% |
| Flood (river + flash) | +20% | +12% | +5% |
| Cyclone | +22% | +15% | +6% |
| Landslide | +20% | +12% | +5% |
| Cold Wave | −20% | −12% | −5% |
| Dust Storm | +28% | +18% | +6% |

---

## 6. Severity (S)

S(h, d) represents the impact magnitude when hazard h strikes district d, derived from WASH and health indicators:

```
S(h, d) = Σ_i  w(h, i) × indicator_i(d)
```

All indicators normalised to [0, 1] (higher = worse vulnerability):

| Indicator | Normalisation | Upper bound |
|---|---|---|
| `waterVuln` = 1 − waterAccess% / 100 | Already [0,1] | — |
| `toiletVuln` = 1 − toiletCoverage% / 100 | Already [0,1] | — |
| `hwVuln` = 1 − handwashing% / 100 | Already [0,1] | — |
| `imrNorm` = IMR / 80 | Capped at 1 | IMR 80 |
| `stuntNorm` = stunting% / 60 | Capped at 1 | 60% |
| `wastNorm` = wasting% / 30 | Capped at 1 | 30% |
| `mmrNorm` = MMR / 500 | Capped at 1 | 500 |

Weights by hazard (rows sum to 1):

| Hazard | waterVuln | toiletVuln | hwVuln | imrNorm | stuntNorm | wastNorm | mmrNorm |
|---|---|---|---|---|---|---|---|
| Heat | 0.35 | 0.05 | 0.05 | 0.30 | 0.05 | 0.15 | 0.05 |
| Drought | 0.40 | 0.15 | 0.05 | 0.10 | 0.25 | 0.05 | 0.00 |
| Flood (river) | 0.15 | 0.45 | 0.10 | 0.20 | 0.05 | 0.05 | 0.00 |
| Flood (flash) | 0.15 | 0.40 | 0.10 | 0.25 | 0.05 | 0.05 | 0.00 |
| Cyclone | 0.20 | 0.30 | 0.10 | 0.25 | 0.05 | 0.05 | 0.05 |
| Landslide | 0.25 | 0.10 | 0.05 | 0.40 | 0.10 | 0.10 | 0.00 |
| Cold Wave | 0.15 | 0.10 | 0.05 | 0.40 | 0.10 | 0.15 | 0.05 |
| Dust Storm | 0.25 | 0.05 | 0.15 | 0.40 | 0.05 | 0.05 | 0.05 |

---

## 7. Vulnerability (V)

```
V(d) = sensitivityScore(d) × [1 − adaptationScore(d)]
```

- `sensitivityScore`: CVI column 7 (set by `importCVI.ts`), normalised to [0,1]
- `adaptationScore`: CVI adaptive capacity component, normalised to [0,1]
- Fallback if sensitivityScore is null: `V = vulnerabilityScore × (1 − adaptationScore × 0.5)`

---

## 8. Global Normalisation

All per-hazard raw values `L × H × S × V` are **globally min-max normalised** across all districts, scenarios, and horizon years before aggregation. This ensures cross-scenario temporal comparability and a [0,1] output range.

```
Risk_norm(h, d, s, y) = [raw(h,d,s,y) − min_h] / [max_h − min_h]
```

---

## 9. Composite Risk (8-Hazard Model)

```
Risk_total(d, s, y) = Σ_h  w(h) × Risk_norm(h)
                    + Σ_{i < j}  max(M(i,j), 0) / 2 × √[Risk_norm(i) × Risk_norm(j)]
```

Equal weights: `w(h) = 1/8` for all hazards (no empirical basis for differential weighting at national scale).

The second term is the **Gill & Malamud (2014) interaction correction**:
- Only positive interaction codes contribute (code > 0 means hazard i amplifies hazard j)
- `M(i,j)` is the qualitative interaction code from `hazard_interaction_matrix` (−2 to +2)
- Interaction contribution is stored in `multi_hazard_projections.interaction_contribution`

---

## 10. Hazard Interaction Matrix

Based on Gill & Malamud (2014) *Rev. Geophys.* 52, 680–722, adapted for the Indian hazard context. Key interactions:

| Hazard i | Hazard j | Code | Type | Rationale |
|---|---|---|---|---|
| Heat | Drought | +2 | Trigger | Drives evapotranspiration → drought onset |
| Heat | Dust Storm | +2 | Trigger | Hot dry boundary layer triggers dust |
| Drought | Dust Storm | +2 | Trigger | Dry bare soils are primary dust source |
| Drought | Heat | +1 | Increase | Dry soils amplify surface temperatures |
| Flood (river) | Landslide | +2 | Trigger | Riverine flooding saturates slopes |
| Flood (flash) | Landslide | +2 | Trigger | Flash floods destabilise slopes directly |
| Cyclone | Flood (river) | +2 | Trigger | Cyclone rainfall overwhelms rivers |
| Cyclone | Flood (flash) | +2 | Trigger | Cyclone causes coastal flash floods |
| Cyclone | Landslide | +2 | Trigger | Intense rainfall saturates slopes |
| Heat | Cold Wave | −2 | Inhibit | Mutually exclusive seasonal extremes |
| Drought | Flood (river) | −1 | Inhibit | Drought reduces base flow |
| Flood (river) | Dust Storm | −2 | Inhibit | Wet surfaces eliminate dust |

Full 56-pair matrix in `server/multiHazardConfig.ts → INTERACTION_DATA`.

---

## 11. 3-Hazard Model (v0, backward-compatible)

The original model continues to run and populate `vulnerability_projections`:

```
Risk(d, s, y) = geometric_mean(Heat_norm, Drought_norm, Flood_norm) × E(d) × V(d)
```

where E = `exposureScore` (CVI composite) and V uses the same formula as above.

Outputs: `deterioration` = Risk(s,y) − Risk(baseline,2025); `avoidedDamage` = Risk(current_policies,2050) − Risk(net_zero,2050).

---

## 12. Stated Limitations (v1)

1. **Likelihood at state level**: district-level return-period data planned for v2.
2. **Severity proxied from WASH/health**: direct damage-function modelling planned for v2.
3. **E and V frozen at present-day CVI**: SSP socioeconomic pathway evolution planned for v2.
4. **Compound co-occurrence not jointly modelled**: interaction terms are additive corrections, not joint probability distributions.
5. **Cold wave**: declining frequency conflicts with increased intensity of individual events; both signals are modelled conservatively.
6. **Geographic scope binary**: in/out-of-scope uses state boundaries; sub-state geographic variation not captured.
7. **Gill & Malamud interaction strengths (`strength` field)**: all null — qualitative codes used; empirical calibration planned for v2.

---

## 13. Primary Citations

- IPCC (2021). AR6 WG1 Ch.11 (Seneviratne et al.) — extreme event frequency projections.
- IPCC (2021). AR6 WG1 Ch.12 (Ranasinghe et al.) — South Asia regional climate assessment.
- Gill, J.C. & Malamud, B.D. (2014). Reviewing and visualising the interactions of natural hazards. *Rev. Geophys.* 52, 680–722.
- Fischer, E.M. & Knutti, R. (2015). Anthropogenic contribution to global occurrence of heavy-precipitation and high-temperature extremes. *Nature Climate Change* 5, 560–564.
- Krishnan, R. et al. (2021). Assessment of Climate Change over the Indian Region. Springer.
- NDMA (2019). National Disaster Risk Reduction Plan. Government of India.
- CWC (2018). Flood Atlas of India. Central Water Commission.
- Knutson et al. (2020). Tropical cyclones and climate change assessment. *BAMS* 101, E303–E322.
