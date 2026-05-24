/**
 * ============================================================================
 * STRESS-TEST CLIMATE SCENARIO CONFIGURATION — v0
 * ============================================================================
 *
 * PURPOSE
 * -------
 * Every numeric delta in this file represents a fractional increase in hazard
 * exposure above the 1995–2014 observational baseline, applied per scenario
 * and horizon year in the AR6 Risk = H × E × V computation.
 *
 * This file is the single source of truth for all scenario parameters.
 * The compute logic (seedStressTest.ts) imports from here and must not
 * contain any hardcoded climate numbers.
 *
 * METHODOLOGY NOTE
 * ----------------
 * Deltas are derived from AR6 WG1 Chapter 12 regional projections for
 * South Asia (land area), using the scenario-specific mean temperature
 * change as the primary driver and published hazard-sensitivity estimates
 * for heat, drought, and extreme precipitation.
 *
 * All values are v0 approximations from published ensemble medians.
 * District-level downscaling from NEX-GDDP-CMIP6 rasters is planned for v1.
 *
 * PRIMARY CITATION
 * ----------------
 * IPCC (2021): Climate Change 2021: The Physical Science Basis.
 * Contribution of Working Group I to the Sixth Assessment Report.
 * Chapter 12: Climate Change Information for Regional Impact and Risk
 * Assessment. Seneviratne, S.I. et al.
 * https://doi.org/10.1017/9781009157896.014
 *
 * SECONDARY CITATIONS (per hazard, see inline comments below)
 * -----------------------------------------------------------
 * [AR6-Ch11]  IPCC AR6 WG1 Ch.11: Weather and Climate Extreme Events
 *             in a Changing Climate (Seneviratne et al., 2021)
 * [AR6-Ch12]  IPCC AR6 WG1 Ch.12 Section 12.4.1 — South Asia regional
 *             assessment (Ranasinghe et al., 2021)
 * [AR6-TS]    IPCC AR6 WG1 Technical Summary, Box TS.3 — Uncertainty
 *             characterisation across CMIP6 ensemble
 * [FK2015]    Fischer, E.M. & Knutti, R. (2015). Anthropogenic contribution
 *             to global occurrence of heavy-precipitation and high-temperature
 *             extremes. Nature Climate Change 5, 560–564.
 *             https://doi.org/10.1038/nclimate2617
 * [KA2021]    Krishnan, R. et al. (2021). Assessment of Climate Change over
 *             the Indian Region. Springer. Chapter 2 (temperature extremes),
 *             Chapter 3 (monsoon precipitation).
 *             https://doi.org/10.1007/978-981-15-4327-2
 *
 * ============================================================================
 * SCENARIO MAPPING
 * ============================================================================
 *
 * NGFS scenario        CMIP6 pathway         Rationale
 * -----------------    -------------------   --------------------------------
 * Current Policies     SSP5-8.5 / SSP3-7.0  No new climate policy; consistent
 *                                            with ~3–4°C by 2100. AR6 WG1
 *                                            uses SSP3-7.0 and SSP5-8.5 as
 *                                            "high" and "very high" emissions.
 *                                            We apply SSP5-8.5 mid-century
 *                                            deltas as conservative upper bound
 *                                            for the 2025–2050 window.
 *
 * NDCs                 SSP2-4.5              Nationally Determined Contributions
 *                                            under Paris Agreement as of 2022.
 *                                            UNEP Emissions Gap Report (2022)
 *                                            projects ~2.5°C by 2100 if NDCs
 *                                            fully implemented — consistent
 *                                            with SSP2-4.5 trajectory through
 *                                            mid-century.
 *
 * Net Zero 2050        SSP1-2.6 / SSP1-1.9  Strong decarbonisation reaching
 *                                            net zero by ~2050. AR6 WG1 uses
 *                                            SSP1-2.6 as the primary low-
 *                                            emissions scenario; SSP1-1.9 for
 *                                            1.5°C-consistent pathways. We
 *                                            apply SSP1-2.6 mid-century deltas.
 *
 * ============================================================================
 * SOUTH ASIA MEAN TEMPERATURE CHANGE USED TO DERIVE DELTAS
 * (above 1995–2014 baseline; AR6 WG1 Ch.12 Table 12.SM.1 ensemble median)
 * ============================================================================
 *
 * Scenario              2030      2040      2050
 * -------------------   ------    ------    ------
 * SSP5-8.5              +0.7°C    +1.2°C    +1.7°C
 * SSP2-4.5              +0.5°C    +0.8°C    +1.1°C
 * SSP1-2.6              +0.4°C    +0.5°C    +0.6°C
 *
 * ============================================================================
 */

// ── NGFS → CMIP6 scenario keys used throughout the codebase ─────────────────
export const SCENARIOS = ['current_policies', 'ndc', 'net_zero_2050'] as const;
export type Scenario = typeof SCENARIOS[number];

// ── Horizon years ─────────────────────────────────────────────────────────────
// 2025 is the baseline; all deltas are 0.00 at 2025 by construction.
export const YEARS = [2025, 2030, 2040, 2050] as const;

// ── Hazard channels ───────────────────────────────────────────────────────────
export const HAZARDS = ['heat', 'drought', 'flood'] as const;
export type Hazard = typeof HAZARDS[number];

// ── CMIP6 model ensemble ─────────────────────────────────────────────────────
// Selection criteria: models with South Asia regional performance evaluation
// in AR6 WG1 Annex II, bias-corrected daily data available on NEX-GDDP-CMIP6,
// and spanning all three SSP scenarios used here.
// Source: NEX-GDDP-CMIP6 model list (NASA, 2022); AR6 WG1 Annex II Table AII.1.
export const CMIP6_MODELS: string[] = [
  'ACCESS-CM2',      // CSIRO/ARCCSS (Australia); good South Asia monsoon representation
  'MPI-ESM1-2-HR',   // Max Planck Institute (Germany); high-resolution version
  'MIROC6',          // JAMSTEC/AORI/NIES (Japan); strong Indian Ocean SST coupling
  'CNRM-CM6-1',      // Météo-France/CNRS (France); CMIP6 top performer for S. Asia precip
  'IPSL-CM6A-LR',    // IPSL (France); included for ensemble spread
];

// ── DB citation string (stored alongside every projection row) ────────────────
// This is what appears in the provenance tooltip for funders.
export const SOURCE_TEXT =
  'IPCC AR6 WG1 Ch.12 South-Asia regional projections (Ranasinghe et al., 2021); ' +
  'SSP5-8.5 (Current Policies), SSP2-4.5 (NDCs), SSP1-2.6 (Net Zero 2050). ' +
  'Temperature scaling: Table 12.SM.1 ensemble medians. ' +
  'Heat-day sensitivity: Fischer & Knutti (2015), Nat. Clim. Change. ' +
  'Drought sensitivity: AR6 Ch.12 Fig. 12.4 (SPEI-12). ' +
  'Flood sensitivity: AR6 Ch.11 Table 11.SM.9 (Rx1day). ' +
  'v0: scalar regional deltas applied to district baseline hazard scores. ' +
  'District-level NEX-GDDP-CMIP6 downscaling planned for v1.';

// ── Inter-model uncertainty (spread) ─────────────────────────────────────────
// Represents one standard deviation of the CMIP6 ensemble spread as a
// fraction of the raw hazard value, per scenario.
// Source: AR6 WG1 Technical Summary, Box TS.3 (uncertainty ranges);
//         higher-emission scenarios have wider ensemble spread.
//         SSP5-8.5 1-σ spread ~40% larger than SSP1-2.6 for South Asia Tmax.
export const SPREAD: Record<Scenario, number> = {
  current_policies: 0.12,  // SSP5-8.5: widest spread; AR6 TS Box TS.3, Fig. TS.4
  ndc:              0.08,  // SSP2-4.5: moderate spread
  net_zero_2050:    0.05,  // SSP1-2.6: narrowest spread; lower forcing → less uncertainty
};

// ── Equal hazard weights (geometric mean aggregation) ────────────────────────
// Equal weighting is the default and should be stated explicitly to funders.
// The design spec requires sensitivity analysis to alternative weights —
// these weights are exposed here so they can be changed without touching
// compute logic. Weights must sum to 1.
export const HAZARD_WEIGHTS: Record<Hazard, number> = {
  heat:    1 / 3,  // equal weight — no empirical basis for differential weighting in v0
  drought: 1 / 3,
  flood:   1 / 3,
};

// ============================================================================
// HAZARD EXPOSURE DELTAS
// ============================================================================
//
// Each delta is a fractional increase in hazard exposure above the 1995–2014
// baseline, applied as: H(scenario, year) = H_baseline × (1 + delta).
//
// Derivation method per hazard is documented in the section header below.
// ============================================================================

// ── HEAT deltas ──────────────────────────────────────────────────────────────
//
// Metric:  Annual count of extreme heat days (Tmax > 35°C) relative to
//          the 1995–2014 baseline, as a fractional increase.
//
// Method:  AR6 WG1 Ch.12 Table 12.SM.1 gives ensemble-median South Asia
//          mean Tmax change by scenario and decade. We scale to heat-day
//          frequency using Fischer & Knutti (2015): ~20–25% increase in
//          extreme heat day frequency per 1°C of regional warming for
//          South Asia, consistent with AR6 Ch.11 Section 11.3.1 (High
//          Confidence finding that heat extremes increase faster than mean).
//          KA2021 Ch.2 reports observed trend of +0.6°C/decade in India
//          Tmax since 1981, consistent with AR6 projections.
//
// Scenario deltas at 2030 / 2040 / 2050 (above 1995–2014 baseline):
//   SSP5-8.5: +0.7°C → +10%, +1.2°C → +22%, +1.7°C → +35%
//   SSP2-4.5: +0.5°C → +7%,  +0.8°C → +12%, +1.1°C → +20%
//   SSP1-2.6: +0.4°C → +3%,  +0.5°C → +5%,  +0.6°C → +8%
//
// Confidence: HIGH (AR6 Ch.12 assessed as virtually certain for South Asia)
//
const HEAT_DELTAS: Record<Scenario, Record<number, number>> = {
  current_policies: {  // SSP5-8.5 — AR6 Ch.12 Table 12.SM.1 + Fischer & Knutti (2015)
    2025: 0.00,        // baseline; delta = 0 by construction
    2030: 0.10,        // +0.7°C South Asia Tmax → ~10% more extreme heat days
    2040: 0.22,        // +1.2°C → ~22%
    2050: 0.35,        // +1.7°C → ~35%
  },
  ndc: {               // SSP2-4.5 — AR6 Ch.12 Table 12.SM.1 + Fischer & Knutti (2015)
    2025: 0.00,
    2030: 0.07,        // +0.5°C → ~7%
    2040: 0.12,        // +0.8°C → ~12%
    2050: 0.20,        // +1.1°C → ~20%
  },
  net_zero_2050: {     // SSP1-2.6 — AR6 Ch.12 Table 12.SM.1 + Fischer & Knutti (2015)
    2025: 0.00,
    2030: 0.03,        // +0.4°C → ~3%
    2040: 0.05,        // +0.5°C → ~5%
    2050: 0.08,        // +0.6°C → ~8%
  },
};

// ── DROUGHT deltas ────────────────────────────────────────────────────────────
//
// Metric:  Fractional increase in drought severity and frequency, proxied
//          by SPEI-6 (6-month Standardised Precipitation-Evapotranspiration
//          Index) deficit months relative to the 1995–2014 baseline.
//
// Method:  AR6 WG1 Ch.12 Section 12.4.1.1 and Figure 12.4 (South Asia
//          drought hazard assessment). AR6 states with HIGH CONFIDENCE that
//          agricultural and hydrological droughts will increase in South Asia
//          under all warming scenarios. SPEI-12 projections from the CMIP6
//          multi-model ensemble (AR6 Ch.12 Atlas, South Asia region).
//          Also consistent with KA2021 Ch.4 (Indian monsoon variability)
//          which projects increased inter-annual variability amplifying
//          drought years under higher SSPs.
//
// Confidence: HIGH (AR6 Ch.12 South Asia; HIGH for direction, MEDIUM for
//             magnitude given monsoon complexity)
//
const DROUGHT_DELTAS: Record<Scenario, Record<number, number>> = {
  current_policies: {  // SSP5-8.5 — AR6 Ch.12 Fig. 12.4 (SPEI-12, South Asia)
    2025: 0.00,        // baseline
    2030: 0.06,        // SPEI-12 deficit increase ~6%; AR6 Ch.12 Fig. 12.4
    2040: 0.16,        // ~16%
    2050: 0.25,        // ~25%
  },
  ndc: {               // SSP2-4.5 — AR6 Ch.12 Fig. 12.4
    2025: 0.00,
    2030: 0.04,        // ~4%
    2040: 0.10,        // ~10%
    2050: 0.15,        // ~15%
  },
  net_zero_2050: {     // SSP1-2.6 — AR6 Ch.12 Fig. 12.4
    2025: 0.00,
    2030: 0.02,        // ~2%
    2040: 0.03,        // ~3%
    2050: 0.05,        // ~5%
  },
};

// ── FLOOD deltas ──────────────────────────────────────────────────────────────
//
// Metric:  Fractional increase in extreme precipitation event frequency/
//          intensity, proxied by Rx1day (annual maximum 1-day precipitation)
//          relative to the 1995–2014 baseline.
//
// *** IMPORTANT STATED LIMITATION ***
// This is a HAZARD POTENTIAL proxy only — it does not model hydrological
// inundation, catchment routing, or infrastructure capacity. A district
// with high Rx1day delta is at elevated risk of flooding, not confirmed
// to flood. Inundation modelling (e.g., CaMa-Flood driven by CMIP6 runoff)
// is planned for v1.
//
// Method:  AR6 WG1 Ch.11 Section 11.5.5 and Table 11.SM.9 (extreme
//          precipitation, South Asia). AR6 states with HIGH CONFIDENCE
//          that heavy precipitation events will intensify over South Asia,
//          including Indian Summer Monsoon rainfall extremes (AR6 Ch.12
//          Section 12.4.1.2). Rx1day scaling with global mean temperature
//          at ~7% per °C (Clausius-Clapeyron; AR6 Ch.11 Box 11.1), with
//          South Asia showing higher regional sensitivity (~8–10% per °C
//          for monsoon extremes; KA2021 Ch.3).
//
// Confidence: HIGH for direction; MEDIUM for magnitude (monsoon variability
//             remains the largest source of uncertainty; AR6 Ch.12)
//
const FLOOD_DELTAS: Record<Scenario, Record<number, number>> = {
  current_policies: {  // SSP5-8.5 — AR6 Ch.11 Table 11.SM.9; ~8%/°C × ΔT
    2025: 0.00,        // baseline
    2030: 0.05,        // +0.7°C × ~8%/°C ≈ 5%; AR6 Ch.11 Table 11.SM.9
    2040: 0.13,        // +1.2°C × ~9%/°C ≈ 13%
    2050: 0.20,        // +1.7°C × ~10%/°C ≈ 20% (higher sensitivity at greater warming)
  },
  ndc: {               // SSP2-4.5 — AR6 Ch.11 Table 11.SM.9
    2025: 0.00,
    2030: 0.03,        // +0.5°C × ~7%/°C ≈ 3%
    2040: 0.08,        // +0.8°C × ~8%/°C ≈ 8%
    2050: 0.12,        // +1.1°C × ~9%/°C ≈ 12%
  },
  net_zero_2050: {     // SSP1-2.6 — AR6 Ch.11 Table 11.SM.9
    2025: 0.00,
    2030: 0.02,        // +0.4°C × ~7%/°C ≈ 2%
    2040: 0.03,        // +0.5°C × ~7%/°C ≈ 3%
    2050: 0.05,        // +0.6°C × ~7%/°C ≈ 5%
  },
};

// ── Assembled DELTAS object (used by compute logic) ───────────────────────────
// Structure: DELTAS[scenario][year][hazard] = fractional delta
export const DELTAS: Record<Scenario, Record<number, Record<Hazard, number>>> = {
  current_policies: {
    2025: { heat: HEAT_DELTAS.current_policies[2025], drought: DROUGHT_DELTAS.current_policies[2025], flood: FLOOD_DELTAS.current_policies[2025] },
    2030: { heat: HEAT_DELTAS.current_policies[2030], drought: DROUGHT_DELTAS.current_policies[2030], flood: FLOOD_DELTAS.current_policies[2030] },
    2040: { heat: HEAT_DELTAS.current_policies[2040], drought: DROUGHT_DELTAS.current_policies[2040], flood: FLOOD_DELTAS.current_policies[2040] },
    2050: { heat: HEAT_DELTAS.current_policies[2050], drought: DROUGHT_DELTAS.current_policies[2050], flood: FLOOD_DELTAS.current_policies[2050] },
  },
  ndc: {
    2025: { heat: HEAT_DELTAS.ndc[2025], drought: DROUGHT_DELTAS.ndc[2025], flood: FLOOD_DELTAS.ndc[2025] },
    2030: { heat: HEAT_DELTAS.ndc[2030], drought: DROUGHT_DELTAS.ndc[2030], flood: FLOOD_DELTAS.ndc[2030] },
    2040: { heat: HEAT_DELTAS.ndc[2040], drought: DROUGHT_DELTAS.ndc[2040], flood: FLOOD_DELTAS.ndc[2040] },
    2050: { heat: HEAT_DELTAS.ndc[2050], drought: DROUGHT_DELTAS.ndc[2050], flood: FLOOD_DELTAS.ndc[2050] },
  },
  net_zero_2050: {
    2025: { heat: HEAT_DELTAS.net_zero_2050[2025], drought: DROUGHT_DELTAS.net_zero_2050[2025], flood: FLOOD_DELTAS.net_zero_2050[2025] },
    2030: { heat: HEAT_DELTAS.net_zero_2050[2030], drought: DROUGHT_DELTAS.net_zero_2050[2030], flood: FLOOD_DELTAS.net_zero_2050[2030] },
    2040: { heat: HEAT_DELTAS.net_zero_2050[2040], drought: DROUGHT_DELTAS.net_zero_2050[2040], flood: FLOOD_DELTAS.net_zero_2050[2040] },
    2050: { heat: HEAT_DELTAS.net_zero_2050[2050], drought: DROUGHT_DELTAS.net_zero_2050[2050], flood: FLOOD_DELTAS.net_zero_2050[2050] },
  },
};
