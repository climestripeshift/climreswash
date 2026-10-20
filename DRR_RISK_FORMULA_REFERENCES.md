# How UNICEF and international DRR frameworks calculate risk

Compiled 18 October 2026 from the frameworks' own documents (links in each section). Reference for the per-hazard formula reviews, starting with [FORMULA_REVIEW_FLOOD.md](FORMULA_REVIEW_FLOOD.md).

## 1. Summary

Every framework starts from the same idea, **risk comes from hazard, exposure and vulnerability, reduced by capacity** (UNDRR, IPCC AR6). They differ in three choices:

1. **How the parts are combined:** a plain product (UNDRR, India's Finance Commission), product divided by capacity (UNICEF GRIP), or a **geometric mean of equally weighted dimensions** (INFORM, which UNICEF's global index follows).
2. **How exposure is measured:** for floods, the international norm is **people living inside a modelled flood extent at a stated return period** (INFORM, UNICEF CCRI, World Bank ThinkHazard), not a rainfall statistic.
3. **How indicators are scaled:** min–max to 0–10, with a **log transform for skewed counts** (INFORM), or percentiles (CEEW).

For flood intensity, the World Bank's ThinkHazard uses **0.5 m water depth as the damaging threshold** and classes hazard by **how often** that depth is reached (1-in-10, 1-in-50, 1-in-1000 years).

## 2. Frameworks compared

| Framework (owner) | Risk formula | How flood enters | Scaling and aggregation | Level |
|---|---|---|---|---|
| **INFORM Risk Index** (EC JRC + IASC; used by UN agencies incl. UNICEF) | `Risk = (Hazard&Exposure)^1/3 × Vulnerability^1/3 × Lack of coping capacity^1/3` | **Annual average exposed population** from flood maps at 25–1000-yr return periods (GAR 2015, 1 km) × population grid; absolute and per-capita | Min–max to 0–10; **log for absolute exposure**; absolute and relative averaged; hazards combined by geometric mean | Country; subnational versions exist |
| **UNICEF Children's Climate Risk Index (CCRI, 2021)** | Two pillars: exposure to hazards × child vulnerability (index built INFORM-style; aggregation rules in a separate methodology paper) | **Children under 18 exposed to riverine floods, 1-in-50-yr** (GAR 2015), number and %; coastal floods from WRI Aqueduct 3.0 | Geometric and arithmetic averages at different levels | Country (global ranking) |
| **UNICEF CCRI-DRM** (subnational, 20+ countries) | Builds on CCRI as its main reference | Not stated in the public overview | Not public in what we could access | Subnational |
| **UNICEF GRIP** (Guidance on Risk-Informed Programming, 2018) | `Risk = (Hazard, shock or stress × Exposure × Vulnerability) / Capacity` | Programme-level: likelihood (1–5) × impact (1–5) score per shock; INFORM to confirm country rating; child-centred risk mapping for subnational analysis | Likelihood × impact matrix | Programme / country / subnational |
| **UNICEF WASH climate-resilience framework** (UNICEF Indonesia) | `R = (H × E × V) f(C)`: scores multiplied; capacity considered but not in the product | Hazard scored per WASH entity | Scores multiplied; no fixed normalisation | WASH systems and sites |
| **World Bank ThinkHazard!** (GFDRR) | Hazard classification, not a risk score | River/urban flood: area flooded to **≥ 0.5 m** at **10-yr = High, 50-yr = Medium, 1000-yr (or highest available) = Low**. Coastal: 2.0 m for High | Classes, not scores | Admin units (global) |
| **UNDRR / Sendai, IPCC AR6** | Risk from hazard × exposure × vulnerability (conceptual; AR6 gives no fixed equation). Probabilistic form: expected annual loss / affected population integrated over return periods | Return-period hazard maps | — | Any |
| **India 15th Finance Commission DRI** | State allocation from capacity (past spending), exposure (area, population) and a **hazard & vulnerability index** | Flood one of the hazards | Combined with expenditure for allocation | State |
| **India 16th Finance Commission DRI** (with CDRI) | **DRI = Hazard × Exposure × Vulnerability**; 10 hazards incl. flood, cloudburst, heatwave | Hazard quintile scores from national datasets, weighted by actual DM expenditure; exposure = projected population; vulnerability = per-capita income | DRI weighted 30 % with 70 % past expenditure for allocation | State |
| **CEEW Climate Vulnerability Index** (India, district) | `V = f(E × S) / AC` | Exposure = frequency of extreme events per district, 1970–2019 (CEEW catalogue) | Percentile normalisation to 0–1; AHP weights | District |

## 3. Details and sources

### INFORM (the most widely used, and the closest analogue to a gridded model)

- Three dimensions, equal weight, multiplied as a geometric mean: *"Risk = Hazard&Exposure^1/3 × Vulnerability^1/3 × Lack of coping capacity^1/3. It is a multiplicative equation. The risk equals zero if one of the three dimensions is zero."*
- **Hazard & exposure** holds hazard-dependent factors. **Vulnerability** holds hazard-independent socio-economic fragility (poverty, inequality, vulnerable groups such as children under 5). **Lack of coping capacity** holds institutional and infrastructure factors, including **access to improved water and sanitation**.
- Flood: return-period maps (25, 50, 100, 200, 500, 1000 years) intersected with a population grid give **annual average exposed population (AAEP)**. Absolute AAEP is log-transformed (range log 100 to log 10⁶); relative AAEP is AAEP ÷ population; both are min–max scaled to 0–10 and averaged.
- Normalisation: `x_norm = (x − min) / (max − min) × 10`; indicators where higher is better are inverted (`10 − x`). Geometric averaging within dimensions follows invert → rescale to 1–10 → geometric mean → rescale → re-invert.
- Sources: [INFORM methodology page](https://drmkc.jrc.ec.europa.eu/inform-index/InDepth/Methodology); [INFORM Concept and Methodology 2017 (PDF)](https://drmkc.jrc.ec.europa.eu/inform-index/Portals/0/InfoRM/INFORM%20Concept%20and%20Methodology%20Version%202017%20Pdf%20FINAL.pdf).

### UNICEF CCRI (2021) and the 2026 Children's Climate Risk Report

- Pillar 1, exposure to climate and environmental hazards, shocks and stresses; Pillar 2, child vulnerability (health, nutrition, education, **WASH**, poverty and social protection).
- Riverine flood indicator: *"Children U18 exposed to riverine floods – 50 yrp"*, as number and %, from GAR 2015. Coastal flood: children living in high/very high coastal flood risk areas, WRI Aqueduct 3.0.
- The 2026 report introduces a *"Children's Climate Risk Framework, pairing hazard exposure with children's vulnerability, including their access to health, water, sanitation and hygiene (WASH)"* ([UN-Water summary](https://www.unwater.org/news/unicef-children%E2%80%99s-climate-risk-report-2026-highlights-threats-wash-systems)). Its calculation is not on the report page; the methodology annex should be obtained.
- Sources: [CCRI report (PDF)](https://digitallibrary.un.org/record/3936790/files/UNICEF-climate-crisis-child-rights-crisis.pdf); [Children's Climate Risk Report 2026](https://www.unicef.org/reports/childrens-climate-risk-report-2026); [CCRI-DRM](https://www.unicef.org/documents/CCRI-DRM) (technical resources on [Knowledge at UNICEF](https://knowledge.unicef.org/ccri-drm-page), not reviewed).

### UNICEF GRIP (2018)

- Equation: *Risk = Hazard, shock or stress × Exposure × Vulnerability / Capacity* (Module 1 p. 19; Module 2 p. 23).
- Rating: IASC-style likelihood 1–5 × impact 1–5 per shock, over a 4–5 year programme cycle (Module 2 pp. 24–29). INFORM is used to confirm the country rating. Higher-risk countries add child-centred subnational risk mapping (Module 2 pp. 14–15).
- Source: [GRIP all modules (PDF)](https://www.unicef.org/media/95276/file/GRIP-All-Modules.pdf). The same equation appears in UNICEF's [risk-informed education guidance](https://www.unicef.org/media/65436/file/Risk-informed%20education%20programming%20for%20resilience:%20Guidance%20note.pdf).

### UNICEF WASH climate resilience

- Indonesia framework: `R = (H × E × V) f(C)`; hazard, exposure and vulnerability scores are multiplied, and capacity is assessed but not inside the product.
- WASH vulnerability grouped by entity: **infrastructure/service** (age, design, siting, material durability, O&M funding, skilled staff), **service users** (housing conditions and location, condition of WASH facilities, density, hygiene practice, income, inequality) and **water bodies** (topography, pollution, catchment management).
- Global companion: the UNICEF/GWP [Strategic Framework for WASH Climate Resilient Development](https://www.unwater.org/news/strategic-framework-wash-climate-resilient-development-2022-edition) (2022), a four-quadrant process framework rather than a formula.
- Source: [UNICEF Indonesia framework (PDF)](https://www.unicef.org/indonesia/media/23816/file/framework-strengthening-wash-climate-resilience.pdf.pdf).

### World Bank ThinkHazard! (flood intensity classes)

- River and urban flood: *"classified using a threshold of 'area flooded to damaging intensity threshold'. The damaging intensity threshold is 0.5 m … frequency thresholds of 10, 50 and 1000 for high, medium and low hazard."* 0.5 m is where sandbags no longer work (table height). Depth classes recommended by RiskMap: < 0.5, 0.5–1.0, 1.0–2.0, > 2.0 m.
- Coastal flood: 0.5 m for low and medium, **2.0 m for high** (ground floor fully flooded); return periods 10 / 50 / 100 years.
- Source: [ThinkHazard! methods](https://gfdrr.github.io/thinkhazardmethods/).

### India

- 15th Finance Commission: allocation from capacity (past expenditure), risk exposure (area and population) and hazard & vulnerability (DRI) ([NDMA summary](https://ndma.gov.in/sites/default/files/PDF/Reports/XV-FC-Recommendations-FA-NDMA.pdf)).
- 16th Finance Commission (with CDRI): DRI = hazard × exposure × vulnerability across 10 hazards; hazard by quintiles weighted by DM expenditure; exposure = projected population; vulnerability = per-capita income; DRI is 30 % of the allocation formula ([RGICS analysis](https://www.rgics.org/environment/indias-public-finance-for-disaster-management-hits-and-misses-of-the-sixteenth-finance-commission/), a secondary source; verify against the Commission report).
- CEEW district CVI: `V = f(E × S) / AC`; exposure from district extreme-event frequency 1970–2019; percentile normalisation; AHP weights ([CEEW PDF](https://www.ceew.in/sites/default/files/ceew-study-on-climate-change-vulnerability-index-and-district-level-risk-assessment.pdf)).

## 4. What this means for ClimResWASH

| Topic | International practice | ClimResWASH today | Recommendation |
|---|---|---|---|
| Combining parts | Geometric mean of H&E, V, LCC (INFORM, followed by CCRI); or H × E × V (/C) | `H × E × S × (1 − AC × damping) / 10`, a product on 0–10 scales | Keep separate dimensions visible. Consider INFORM's geometric mean as the cross-hazard method: it is the form UNICEF already uses globally and it limits one dimension masking another. **Platform-wide decision.** |
| Flood hazard + exposure | People inside the modelled flood extent at stated return periods; expected annual exposed population | Fixed 50 mm storm × rain-day frequency; whole-hex population | **Adopt INFORM's approach per hex:** expected annual exposed population from JRC return-period maps, absolute (log-scaled) and relative (% of hex) averaged. Also fixes exposure saturation. |
| Flood intensity | ThinkHazard: ≥ 0.5 m damaging depth at 10 / 50 / 1000-yr = High / Medium / Low | Not shown | **Adopt ThinkHazard classes** as the intensity layer, plus depth in metres; WASH-specific depth bands to be agreed by a reviewer. |
| Vulnerability | Hazard-independent socio-economic fragility; children as a vulnerable group | Terrain-based "sensitivity" | Move terrain into hazard; vulnerability from NFHS/poverty/child indicators. |
| Coping capacity | Separate dimension incl. water and sanitation access | AC from NFHS WASH + MPI, subtracted with damping | Keep AC as its own dimension (INFORM's "lack of coping capacity"); add SBM pit type and JJM coverage as WASH-specific factors (UNICEF WASH framework entities). |
| Scaling | Min–max 0–10, log for counts (INFORM); percentiles (CEEW) | Mixed, several caps | Use INFORM-style scaling, documented per indicator. |
| Programme rating | GRIP likelihood × impact (1–5) | — | Useful for facility and site screening (Adaptation/Resilience pages), not for the national grid. |

**None of these indices is validated against observed losses in the way §5 of the flood review proposes.** INFORM checks statistical coherence; CCRI and the Finance Commission indices are composite rankings. Aligning with them makes ClimResWASH comparable and familiar to UNICEF and government users; validation against IFI records is still needed to call results "good".

## 5. Gaps in this review

- CCRI-DRM technical methodology (Knowledge at UNICEF) and the 2026 report's methodology annex were not available in the pages reviewed.
- 16th Finance Commission DRI details come from a secondary analysis; confirm against the Commission's report.
- INFORM Subnational models for South Asia, and India's NDMA guidelines on flood hazard zonation, were not reviewed.

## 6. Status in the 4-D hazard layers (20 October 2026)

How the recommendations above landed in the seven 4-D hazard layers (details in [HAZARD_4D_CALCULATIONS.md](HAZARD_4D_CALCULATIONS.md) §4.8–4.9):

- **Exposure as people and children (INFORM, UNICEF CCRI): done.** Each stress level (baseline, or an IPCC scenario at a horizon) now reports people and children under 5 in the high/extreme and moderate-or-above classes, absolute and as a share, on `/4d` (Stress comparison) and in `reports/hazard_4d_stress_outputs_<date>.md`. INFORM's log scaling for absolute exposure was not applied (built for country totals).
- **Hazard, shock or stress (GRIP): done** as scenario and horizon stress levels.
- **Return-period classes (ThinkHazard 10/50/1000-yr, CCRI 50-yr): partial.** Only the 1-in-10-year storm (flood, landslide, flash flood) and the 1-in-10 dry window (drought) are used.
- **Damaging-depth thresholds (0.5 m): not done**, no flood-depth maps.
- **Vulnerability and coping capacity as separate dimensions: not in the 4-D layers** (hazard only); the cross-hazard combination rule remains decision D7.
- **Validation against observed losses: not done** for the 4-D layers.
- **Population caveat:** the hex grid holds 1,224 million people, about 10 % below the 1,354 million total in `BASE_LAYERS.md` (D8), so exposure counts are within the grid.
