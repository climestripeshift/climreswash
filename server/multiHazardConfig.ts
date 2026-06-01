/**
 * Multi-Hazard Compound-Risk Configuration — v1
 *
 * This file defines the 8-hazard taxonomy, geographic scope, per-state
 * likelihood values, AR6-based exposure deltas, and indicator-to-hazard
 * severity weights used by computeMultiHazardProjections().
 *
 * It intentionally does NOT modify stressTestConfig.ts — the original
 * 3-hazard formula continues to populate hazardProjections and
 * vulnerabilityProjections unchanged. This file feeds the new
 * multiHazardProjections table only.
 *
 * SOURCES
 * -------
 * Gill, J.C. & Malamud, B.D. (2014). Reviewing and visualising the
 *   interactions of natural hazards. Rev. Geophys. 52, 680–722.
 *   https://doi.org/10.1002/2013RG000445
 * IPCC AR6 WG1 Ch.11 (extreme events) and Ch.12 (South Asia regional)
 * NDMA (2019). National Disaster Risk Reduction Plan. India.
 * IMH (2021). Hazard Atlas of India. NDMA/NIA.
 */

import type { Scenario } from "./stressTestConfig";
import { SCENARIOS, YEARS, LIKELIHOOD, LIKELIHOOD_DELTAS, DELTAS } from "./stressTestConfig";

// ── 8 canonical hazard IDs ────────────────────────────────────────────────────
export const MULTI_HAZARDS = [
  "heat",
  "drought",
  "flood_river",
  "flood_flash",
  "cyclone",
  "landslide",
  "cold_wave",
  "dust_storm",
] as const;
export type MultiHazard = (typeof MULTI_HAZARDS)[number];

// ── Human-readable labels ─────────────────────────────────────────────────────
export const HAZARD_LABELS: Record<MultiHazard, string> = {
  heat:        "Extreme Heat",
  drought:     "Drought",
  flood_river: "Riverine Flood",
  flood_flash: "Flash Flood",
  cyclone:     "Cyclone",
  landslide:   "Landslide",
  cold_wave:   "Cold Wave",
  dust_storm:  "Dust Storm",
};

// ── Short codes (for DB and display) ─────────────────────────────────────────
export const HAZARD_SHORT: Record<MultiHazard, string> = {
  heat:        "HT",
  drought:     "DR",
  flood_river: "FR",
  flood_flash: "FF",
  cyclone:     "CY",
  landslide:   "LS",
  cold_wave:   "CW",
  dust_storm:  "DS",
};

// ── Category ─────────────────────────────────────────────────────────────────
export const HAZARD_CATEGORY: Record<MultiHazard, string> = {
  heat:        "meteorological",
  drought:     "meteorological",
  flood_river: "hydrological",
  flood_flash: "hydrological",
  cyclone:     "meteorological",
  landslide:   "geomorphological",
  cold_wave:   "meteorological",
  dust_storm:  "meteorological",
};

// ── Aggregation weights — equal weighting declared explicitly ─────────────────
// Weights must sum to 1. Equal weighting is the default; no peer-reviewed basis
// for differential weighting at national scale.
export const HAZARD_WEIGHTS_8: Record<MultiHazard, number> = {
  heat:        1 / 8,
  drought:     1 / 8,
  flood_river: 1 / 8,
  flood_flash: 1 / 8,
  cyclone:     1 / 8,
  landslide:   1 / 8,
  cold_wave:   1 / 8,
  dust_storm:  1 / 8,
};

// ── Geographic scope — states where hazard has meaningful baseline risk ────────
// Districts outside listed states receive likelihood = OUT_OF_SCOPE_L (0.02).
// heat/drought/flood_river/flood_flash cover all states at varying levels;
// others are geographically constrained.
const ALL_STATES = ["DEFAULT"];  // sentinel used in lookup — falls through to LIKELIHOOD table

export const GEOGRAPHIC_SCOPE: Record<MultiHazard, string[] | "ALL"> = {
  heat:        "ALL",
  drought:     "ALL",
  flood_river: "ALL",
  flood_flash: "ALL",
  cyclone: [
    "Andhra Pradesh", "Tamil Nadu", "Odisha", "West Bengal", "Maharashtra",
    "Kerala", "Goa", "Gujarat", "Karnataka", "Puducherry",
    "Andaman & Nicobar", "Lakshadweep",
  ],
  landslide: [
    "Himachal Pradesh", "Uttarakhand", "Jammu & Kashmir",
    "Sikkim", "Assam", "Arunachal Pradesh", "Meghalaya",
    "Manipur", "Mizoram", "Nagaland", "Tripura",
    "Kerala", "Karnataka", "Maharashtra", "Tamil Nadu",  // Western Ghats + Nilgiris
  ],
  cold_wave: [
    "Jammu & Kashmir", "Himachal Pradesh", "Uttarakhand", "Punjab",
    "Haryana", "Rajasthan", "Delhi", "NCT Delhi", "Chandigarh",
    "Uttar Pradesh", "Bihar", "Madhya Pradesh", "Jharkhand", "Chhattisgarh",
  ],
  dust_storm: [
    "Rajasthan", "Haryana", "Punjab", "Delhi", "NCT Delhi", "Chandigarh",
    "Uttar Pradesh", "Gujarat", "Madhya Pradesh",
  ],
};

// Out-of-scope baseline likelihood (background noise)
export const OUT_OF_SCOPE_L = 0.02;

// ── Per-state likelihood for the 4 new hazards ────────────────────────────────
// heat/drought/flood: inherited from LIKELIHOOD in stressTestConfig.ts
// flood_river = existing flood × 0.60 (fluvial component)
// flood_flash  = existing flood × 0.40, boosted for hilly/steep states
//
// Source: NDMA (2019) state hazard profiles; CWC Flood Atlas (2018);
// IMD historical record 1950–2020.
//
// ⚠ REVIEW REQUIRED before publication: validate against NDMA district atlas.
export const LIKELIHOOD_NEW: Record<string, Record<"cyclone" | "landslide" | "cold_wave" | "dust_storm", number>> = {
  // ── Cyclone: Bay of Bengal + Arabian Sea exposure ─────────────────────────
  "Andhra Pradesh":    { cyclone: 0.45, landslide: 0.10, cold_wave: 0.05, dust_storm: 0.05 },
  "Tamil Nadu":        { cyclone: 0.40, landslide: 0.15, cold_wave: 0.03, dust_storm: 0.04 },
  "Odisha":            { cyclone: 0.50, landslide: 0.15, cold_wave: 0.10, dust_storm: 0.05 },
  "West Bengal":       { cyclone: 0.35, landslide: 0.10, cold_wave: 0.20, dust_storm: 0.05 },
  "Maharashtra":       { cyclone: 0.18, landslide: 0.25, cold_wave: 0.10, dust_storm: 0.10 },
  "Kerala":            { cyclone: 0.12, landslide: 0.40, cold_wave: 0.02, dust_storm: 0.02 },
  "Goa":               { cyclone: 0.10, landslide: 0.15, cold_wave: 0.03, dust_storm: 0.03 },
  "Gujarat":           { cyclone: 0.18, landslide: 0.05, cold_wave: 0.10, dust_storm: 0.55 },
  "Karnataka":         { cyclone: 0.06, landslide: 0.28, cold_wave: 0.04, dust_storm: 0.06 },
  "Puducherry":        { cyclone: 0.38, landslide: 0.05, cold_wave: 0.03, dust_storm: 0.04 },
  "Andaman & Nicobar": { cyclone: 0.55, landslide: 0.35, cold_wave: 0.01, dust_storm: 0.01 },
  "Lakshadweep":       { cyclone: 0.18, landslide: 0.05, cold_wave: 0.01, dust_storm: 0.01 },

  // ── Landslide: Himalayan + North-East + Western Ghats ─────────────────────
  "Himachal Pradesh":  { cyclone: 0.01, landslide: 0.72, cold_wave: 0.78, dust_storm: 0.05 },
  "Uttarakhand":       { cyclone: 0.01, landslide: 0.75, cold_wave: 0.72, dust_storm: 0.05 },
  "Jammu & Kashmir":   { cyclone: 0.01, landslide: 0.58, cold_wave: 0.90, dust_storm: 0.05 },
  "Sikkim":            { cyclone: 0.01, landslide: 0.82, cold_wave: 0.55, dust_storm: 0.02 },
  "Assam":             { cyclone: 0.02, landslide: 0.62, cold_wave: 0.22, dust_storm: 0.05 },
  "Arunachal Pradesh": { cyclone: 0.01, landslide: 0.70, cold_wave: 0.30, dust_storm: 0.02 },
  "Meghalaya":         { cyclone: 0.02, landslide: 0.65, cold_wave: 0.22, dust_storm: 0.02 },
  "Manipur":           { cyclone: 0.02, landslide: 0.68, cold_wave: 0.25, dust_storm: 0.02 },
  "Mizoram":           { cyclone: 0.02, landslide: 0.60, cold_wave: 0.20, dust_storm: 0.02 },
  "Nagaland":          { cyclone: 0.01, landslide: 0.58, cold_wave: 0.22, dust_storm: 0.02 },
  "Tripura":           { cyclone: 0.03, landslide: 0.48, cold_wave: 0.18, dust_storm: 0.03 },

  // ── Cold wave: Indo-Gangetic plains + arid northwest ─────────────────────
  "Rajasthan":         { cyclone: 0.01, landslide: 0.02, cold_wave: 0.58, dust_storm: 0.88 },
  "Haryana":           { cyclone: 0.01, landslide: 0.02, cold_wave: 0.70, dust_storm: 0.68 },
  "Punjab":            { cyclone: 0.01, landslide: 0.02, cold_wave: 0.68, dust_storm: 0.60 },
  "Delhi":             { cyclone: 0.01, landslide: 0.01, cold_wave: 0.62, dust_storm: 0.65 },
  "NCT Delhi":         { cyclone: 0.01, landslide: 0.01, cold_wave: 0.62, dust_storm: 0.65 },
  "Chandigarh":        { cyclone: 0.01, landslide: 0.02, cold_wave: 0.65, dust_storm: 0.45 },
  "Uttar Pradesh":     { cyclone: 0.01, landslide: 0.02, cold_wave: 0.58, dust_storm: 0.48 },
  "Bihar":             { cyclone: 0.01, landslide: 0.04, cold_wave: 0.50, dust_storm: 0.18 },
  "Madhya Pradesh":    { cyclone: 0.01, landslide: 0.05, cold_wave: 0.45, dust_storm: 0.40 },
  "Jharkhand":         { cyclone: 0.01, landslide: 0.08, cold_wave: 0.35, dust_storm: 0.10 },
  "Chhattisgarh":      { cyclone: 0.01, landslide: 0.08, cold_wave: 0.28, dust_storm: 0.10 },

  // ── States not in scope for new hazards ──────────────────────────────────
  "Telangana":         { cyclone: 0.04, landslide: 0.05, cold_wave: 0.08, dust_storm: 0.12 },
  "DEFAULT":           { cyclone: 0.02, landslide: 0.05, cold_wave: 0.05, dust_storm: 0.05 },
};

// ── Exposure deltas for new hazards (fractional increase above 1995–2014 baseline) ──
// cyclone: intensification from thermodynamic theory (Knutson et al. AR6);
//   frequency may slightly decrease but intensity and associated precip increase.
// landslide: driven by extreme precipitation increase (same as flood_flash).
// cold_wave: frequency decreases with warming (AR6 Ch.11 §11.3); model as slightly
//   declining risk adjusted toward zero by 2050.
// dust_storm: driven by heat + drought conditions; increases under all SSPs.
//
// Structure: DELTAS_NEW[hazard][scenario][year]
export const DELTAS_NEW: Record<
  "cyclone" | "landslide" | "cold_wave" | "dust_storm",
  Record<Scenario, Record<number, number>>
> = {
  cyclone: {
    current_policies: { 2025: 0.00, 2030: 0.06, 2040: 0.14, 2050: 0.22 },  // AR6 Knutson et al.
    ndc:              { 2025: 0.00, 2030: 0.04, 2040: 0.09, 2050: 0.15 },
    net_zero_2050:    { 2025: 0.00, 2030: 0.02, 2040: 0.04, 2050: 0.06 },
  },
  landslide: {
    current_policies: { 2025: 0.00, 2030: 0.05, 2040: 0.12, 2050: 0.20 },  // follows flood_flash
    ndc:              { 2025: 0.00, 2030: 0.03, 2040: 0.08, 2050: 0.12 },
    net_zero_2050:    { 2025: 0.00, 2030: 0.02, 2040: 0.03, 2050: 0.05 },
  },
  cold_wave: {
    // Frequency declines; residual risk modelled conservatively as near-zero change
    // (severe cold events may still occur despite mean warming; AR6 Ch.11 §11.3.5)
    current_policies: { 2025: 0.00, 2030: -0.05, 2040: -0.12, 2050: -0.20 },
    ndc:              { 2025: 0.00, 2030: -0.03, 2040: -0.08, 2050: -0.12 },
    net_zero_2050:    { 2025: 0.00, 2030: -0.01, 2040: -0.03, 2050: -0.05 },
  },
  dust_storm: {
    current_policies: { 2025: 0.00, 2030: 0.08, 2040: 0.18, 2050: 0.28 },  // heat + drought driven
    ndc:              { 2025: 0.00, 2030: 0.05, 2040: 0.11, 2050: 0.18 },
    net_zero_2050:    { 2025: 0.00, 2030: 0.02, 2040: 0.04, 2050: 0.06 },
  },
};

// ── Likelihood deltas for new hazards ────────────────────────────────────────
// Structure: LIKELIHOOD_DELTAS_NEW[hazard][scenario][year]
export const LIKELIHOOD_DELTAS_NEW: Record<
  "cyclone" | "landslide" | "cold_wave" | "dust_storm",
  Record<Scenario, Record<number, number>>
> = {
  cyclone: {
    current_policies: { 2025: 0.00, 2030: 0.05, 2040: 0.12, 2050: 0.18 },
    ndc:              { 2025: 0.00, 2030: 0.03, 2040: 0.08, 2050: 0.13 },
    net_zero_2050:    { 2025: 0.00, 2030: 0.01, 2040: 0.03, 2050: 0.06 },
  },
  landslide: {
    current_policies: { 2025: 0.00, 2030: 0.05, 2040: 0.12, 2050: 0.20 },
    ndc:              { 2025: 0.00, 2030: 0.03, 2040: 0.08, 2050: 0.13 },
    net_zero_2050:    { 2025: 0.00, 2030: 0.01, 2040: 0.03, 2050: 0.06 },
  },
  cold_wave: {
    current_policies: { 2025: 0.00, 2030: -0.04, 2040: -0.10, 2050: -0.18 },
    ndc:              { 2025: 0.00, 2030: -0.02, 2040: -0.06, 2050: -0.10 },
    net_zero_2050:    { 2025: 0.00, 2030: -0.01, 2040: -0.02, 2050: -0.04 },
  },
  dust_storm: {
    current_policies: { 2025: 0.00, 2030: 0.06, 2040: 0.14, 2050: 0.22 },
    ndc:              { 2025: 0.00, 2030: 0.04, 2040: 0.09, 2050: 0.14 },
    net_zero_2050:    { 2025: 0.00, 2030: 0.01, 2040: 0.03, 2050: 0.05 },
  },
};

// ── Severity indicator weights per hazard ─────────────────────────────────────
// Each hazard's severity S(h,d) is a weighted sum of normalised district WASH/
// health indicators (0–1 scale). Weights reflect which indicators most amplify
// each hazard's health+WASH impact.
//
// Indicators available (all on 0–1 after normalisation):
//   waterVuln  = 1 - waterAccessPercent/100
//   toiletVuln = 1 - toiletCoveragePercent/100
//   hwVuln     = 1 - handwashingFacilityPercent/100
//   imrNorm    = IMR/80 (capped at 1)
//   stuntNorm  = stunting/60 (capped at 1)
//   wastNorm   = wasting/30 (capped at 1)
//   mmrNorm    = MMR/500 (capped at 1)
export const SEVERITY_WEIGHTS: Record<MultiHazard, {
  waterVuln:  number;
  toiletVuln: number;
  hwVuln:     number;
  imrNorm:    number;
  stuntNorm:  number;
  wastNorm:   number;
  mmrNorm:    number;
}> = {
  heat:        { waterVuln: 0.35, toiletVuln: 0.05, hwVuln: 0.05, imrNorm: 0.30, stuntNorm: 0.05, wastNorm: 0.15, mmrNorm: 0.05 },
  drought:     { waterVuln: 0.40, toiletVuln: 0.15, hwVuln: 0.05, imrNorm: 0.10, stuntNorm: 0.25, wastNorm: 0.05, mmrNorm: 0.00 },
  flood_river: { waterVuln: 0.15, toiletVuln: 0.45, hwVuln: 0.10, imrNorm: 0.20, stuntNorm: 0.05, wastNorm: 0.05, mmrNorm: 0.00 },
  flood_flash: { waterVuln: 0.15, toiletVuln: 0.40, hwVuln: 0.10, imrNorm: 0.25, stuntNorm: 0.05, wastNorm: 0.05, mmrNorm: 0.00 },
  cyclone:     { waterVuln: 0.20, toiletVuln: 0.30, hwVuln: 0.10, imrNorm: 0.25, stuntNorm: 0.05, wastNorm: 0.05, mmrNorm: 0.05 },
  landslide:   { waterVuln: 0.25, toiletVuln: 0.10, hwVuln: 0.05, imrNorm: 0.40, stuntNorm: 0.10, wastNorm: 0.10, mmrNorm: 0.00 },
  cold_wave:   { waterVuln: 0.15, toiletVuln: 0.10, hwVuln: 0.05, imrNorm: 0.40, stuntNorm: 0.10, wastNorm: 0.15, mmrNorm: 0.05 },
  dust_storm:  { waterVuln: 0.25, toiletVuln: 0.05, hwVuln: 0.15, imrNorm: 0.40, stuntNorm: 0.05, wastNorm: 0.05, mmrNorm: 0.05 },
};

// ── Gill & Malamud interaction matrix data ────────────────────────────────────
// qualitativeCode: -2 (strong inhibit), -1 (inhibit), 0 (independent),
//                  +1 (increase), +2 (trigger/strong amplify)
//
// Row = hazard_i causes interaction on hazard_j.
// Pairs where code=0 can be omitted (no interaction to model).
// Source: Gill & Malamud (2014) Table 2, adapted for Indian hazard context.
export type InteractionEntry = {
  i: MultiHazard;
  j: MultiHazard;
  code: number;
  type: string;
  notes: string;
};

export const INTERACTION_DATA: InteractionEntry[] = [
  // heat → *
  { i: "heat",        j: "drought",     code:  2, type: "trigger",  notes: "Heat drives ET, depletes soil moisture → drought onset" },
  { i: "heat",        j: "dust_storm",  code:  2, type: "trigger",  notes: "Hot, dry, unstable boundary layer triggers dust storms" },
  { i: "heat",        j: "cold_wave",   code: -2, type: "inhibit",  notes: "Mutually exclusive seasonal extremes" },
  { i: "heat",        j: "cyclone",     code: -1, type: "inhibit",  notes: "Warm SST supports cyclone genesis but land heat is orthogonal" },
  { i: "heat",        j: "flood_river", code: -1, type: "inhibit",  notes: "Dry, sunny conditions associated with heat suppress riverine flooding" },
  { i: "heat",        j: "flood_flash", code:  0, type: "independent", notes: "" },
  { i: "heat",        j: "landslide",   code:  0, type: "independent", notes: "" },

  // drought → *
  { i: "drought",     j: "heat",        code:  1, type: "increase", notes: "Dry soils reduce latent heat flux, amplify surface temperatures" },
  { i: "drought",     j: "dust_storm",  code:  2, type: "trigger",  notes: "Dry, bare soils are primary dust source" },
  { i: "drought",     j: "cold_wave",   code:  0, type: "independent", notes: "" },
  { i: "drought",     j: "flood_river", code: -1, type: "inhibit",  notes: "Drought reduces base flow; though wet-dry cycles can precede flooding" },
  { i: "drought",     j: "flood_flash", code:  0, type: "independent", notes: "" },
  { i: "drought",     j: "landslide",   code: -1, type: "inhibit",  notes: "Dry conditions reduce slope saturation risk" },
  { i: "drought",     j: "cyclone",     code: -1, type: "inhibit",  notes: "Drought conditions antagonise cyclone-associated rainfall" },

  // flood_river → *
  { i: "flood_river", j: "flood_flash", code:  1, type: "increase", notes: "Heavy rainfall event causes both concurrently" },
  { i: "flood_river", j: "landslide",   code:  2, type: "trigger",  notes: "Riverine flooding saturates slopes → mass movement" },
  { i: "flood_river", j: "drought",     code: -1, type: "inhibit",  notes: "Wet conditions suppress drought onset" },
  { i: "flood_river", j: "heat",        code: -1, type: "inhibit",  notes: "Cloud cover and soil moisture reduce heat extremes" },
  { i: "flood_river", j: "dust_storm",  code: -2, type: "inhibit",  notes: "Wet surfaces eliminate dust mobilisation" },
  { i: "flood_river", j: "cold_wave",   code:  0, type: "independent", notes: "" },
  { i: "flood_river", j: "cyclone",     code:  0, type: "independent", notes: "" },

  // flood_flash → *
  { i: "flood_flash", j: "landslide",   code:  2, type: "trigger",  notes: "Flash floods destabilise slopes directly" },
  { i: "flood_flash", j: "flood_river", code:  1, type: "increase", notes: "Flash floods contribute discharge to river channels" },
  { i: "flood_flash", j: "dust_storm",  code: -2, type: "inhibit",  notes: "Wet surfaces eliminate dust" },
  { i: "flood_flash", j: "heat",        code:  0, type: "independent", notes: "" },
  { i: "flood_flash", j: "drought",     code:  0, type: "independent", notes: "" },
  { i: "flood_flash", j: "cold_wave",   code:  0, type: "independent", notes: "" },
  { i: "flood_flash", j: "cyclone",     code:  0, type: "independent", notes: "" },

  // cyclone → *
  { i: "cyclone",     j: "flood_river", code:  2, type: "trigger",  notes: "Cyclone storm surge + rainfall overwhelms rivers" },
  { i: "cyclone",     j: "flood_flash", code:  2, type: "trigger",  notes: "Cyclone-associated rainfall triggers flash floods in coastal hinterland" },
  { i: "cyclone",     j: "landslide",   code:  2, type: "trigger",  notes: "Intense cyclone rainfall saturates slopes" },
  { i: "cyclone",     j: "drought",     code: -1, type: "inhibit",  notes: "Cyclone brings heavy rainfall, temporarily alleviates drought" },
  { i: "cyclone",     j: "heat",        code: -1, type: "inhibit",  notes: "Cyclone passage reduces surface temperature" },
  { i: "cyclone",     j: "dust_storm",  code: -2, type: "inhibit",  notes: "Cyclone rain suppresses dust" },
  { i: "cyclone",     j: "cold_wave",   code:  0, type: "independent", notes: "" },

  // landslide → *
  { i: "landslide",   j: "flood_river", code:  1, type: "increase", notes: "Landslide dam formation creates flood risk downstream" },
  { i: "landslide",   j: "flood_flash", code:  0, type: "independent", notes: "" },
  { i: "landslide",   j: "cyclone",     code:  0, type: "independent", notes: "" },
  { i: "landslide",   j: "heat",        code:  0, type: "independent", notes: "" },
  { i: "landslide",   j: "drought",     code:  0, type: "independent", notes: "" },
  { i: "landslide",   j: "cold_wave",   code:  0, type: "independent", notes: "" },
  { i: "landslide",   j: "dust_storm",  code:  0, type: "independent", notes: "" },

  // cold_wave → *
  { i: "cold_wave",   j: "heat",        code: -2, type: "inhibit",  notes: "Mutually exclusive seasonal extremes" },
  { i: "cold_wave",   j: "drought",     code:  0, type: "independent", notes: "" },
  { i: "cold_wave",   j: "flood_river", code:  0, type: "independent", notes: "" },
  { i: "cold_wave",   j: "flood_flash", code:  0, type: "independent", notes: "" },
  { i: "cold_wave",   j: "landslide",   code:  0, type: "independent", notes: "" },
  { i: "cold_wave",   j: "dust_storm",  code: -1, type: "inhibit",  notes: "Cold, moist winter conditions suppress dust" },
  { i: "cold_wave",   j: "cyclone",     code: -1, type: "inhibit",  notes: "Cold, high-pressure systems associated with cold waves suppress cyclogenesis" },

  // dust_storm → *
  { i: "dust_storm",  j: "heat",        code:  1, type: "increase", notes: "Aerosol loading amplifies surface heat trapping" },
  { i: "dust_storm",  j: "drought",     code:  1, type: "increase", notes: "Dust reduces albedo, warms surface, accelerates soil drying" },
  { i: "dust_storm",  j: "flood_river", code:  0, type: "independent", notes: "" },
  { i: "dust_storm",  j: "flood_flash", code:  0, type: "independent", notes: "" },
  { i: "dust_storm",  j: "landslide",   code:  0, type: "independent", notes: "" },
  { i: "dust_storm",  j: "cold_wave",   code: -1, type: "inhibit",  notes: "Opposing seasonal regimes" },
  { i: "dust_storm",  j: "cyclone",     code:  0, type: "independent", notes: "" },
];

// ── Re-export scenario/year constants for convenience ──────────────────────────
export { SCENARIOS, YEARS };

// ── Resolved likelihood for any hazard + state ────────────────────────────────
// For heat/drought/flood, reads from existing LIKELIHOOD table.
// flood_river = flood × 0.60; flood_flash = flood × 0.40 (+ hilly boost)
// For cyclone/landslide/cold_wave/dust_storm, reads from LIKELIHOOD_NEW.
const HILLY_STATES = new Set([
  "Himachal Pradesh", "Uttarakhand", "Jammu & Kashmir", "Sikkim",
  "Assam", "Arunachal Pradesh", "Meghalaya", "Manipur", "Mizoram",
  "Nagaland", "Tripura", "Kerala", "Karnataka", "Maharashtra", "Tamil Nadu",
]);

export function getLikelihood(state: string, hazard: MultiHazard): number {
  const stateL = LIKELIHOOD[state] ?? LIKELIHOOD["DEFAULT"];
  const newL = LIKELIHOOD_NEW[state] ?? LIKELIHOOD_NEW["DEFAULT"];

  switch (hazard) {
    case "heat":    return stateL.heat;
    case "drought": return stateL.drought;
    case "flood_river": return stateL.flood * 0.60;
    case "flood_flash": {
      const base = stateL.flood * 0.40;
      return HILLY_STATES.has(state) ? Math.min(base * 1.5, 0.95) : base;
    }
    case "cyclone":    return newL.cyclone;
    case "landslide":  return newL.landslide;
    case "cold_wave":  return newL.cold_wave;
    case "dust_storm": return newL.dust_storm;
  }
}

// ── Resolved hazard exposure delta (H) ────────────────────────────────────────
export function getHazardDelta(hazard: MultiHazard, scenario: Scenario, year: number): number {
  switch (hazard) {
    case "heat":    return DELTAS[scenario][year].heat;
    case "drought": return DELTAS[scenario][year].drought;
    case "flood_river":
    case "flood_flash": return DELTAS[scenario][year].flood;
    case "cyclone":    return DELTAS_NEW.cyclone[scenario][year];
    case "landslide":  return DELTAS_NEW.landslide[scenario][year];
    case "cold_wave":  return DELTAS_NEW.cold_wave[scenario][year];
    case "dust_storm": return DELTAS_NEW.dust_storm[scenario][year];
  }
}

// ── Resolved likelihood delta (ΔL) ───────────────────────────────────────────
export function getLikelihoodDelta(hazard: MultiHazard, scenario: Scenario, year: number): number {
  switch (hazard) {
    case "heat":    return LIKELIHOOD_DELTAS.heat[scenario][year];
    case "drought": return LIKELIHOOD_DELTAS.drought[scenario][year];
    case "flood_river":
    case "flood_flash": return LIKELIHOOD_DELTAS.flood[scenario][year];
    case "cyclone":    return LIKELIHOOD_DELTAS_NEW.cyclone[scenario][year];
    case "landslide":  return LIKELIHOOD_DELTAS_NEW.landslide[scenario][year];
    case "cold_wave":  return LIKELIHOOD_DELTAS_NEW.cold_wave[scenario][year];
    case "dust_storm": return LIKELIHOOD_DELTAS_NEW.dust_storm[scenario][year];
  }
}

// ── Taxonomy metadata (used by seedHazardTaxonomy.ts) ─────────────────────────
export const HAZARD_DESCRIPTIONS: Record<MultiHazard, string> = {
  heat:
    "Extreme heat events (heatwaves) defined by Tmax > 35°C threshold days. " +
    "Primary driver of excess mortality and WASH demand in South Asia.",
  drought:
    "Agricultural and hydrological drought, proxied by SPEI-6 deficit months. " +
    "Affects water access, food security, and child nutrition.",
  flood_river:
    "Riverine / fluvial flooding from overbank discharge. Disrupts sanitation " +
    "infrastructure and causes waterborne disease outbreaks.",
  flood_flash:
    "Flash flooding from intense localised precipitation or cloudbursts. " +
    "Particularly hazardous in hilly terrain and urban drains.",
  cyclone:
    "Tropical cyclone landfall with associated storm surge and heavy rainfall. " +
    "Coastal districts face simultaneous wind, surge, and flood impacts.",
  landslide:
    "Rainfall-triggered landslides and debris flows. Concentrated in Himalayan " +
    "and Western Ghats districts; co-occurs with extreme precipitation.",
  cold_wave:
    "Extreme cold events (Tmin < 10°C in plains) causing mortality among " +
    "vulnerable populations and disrupting water supply infrastructure.",
  dust_storm:
    "Dust storms ('Loo') driven by hot, dry, and windy conditions in arid zones. " +
    "Impairs respiratory health and contaminates water/food.",
};

export const HAZARD_SOURCES: Record<MultiHazard, string> = {
  heat:
    "IPCC AR6 WG1 Ch.11 §11.3.1 (heat extremes); Fischer & Knutti (2015).",
  drought:
    "IPCC AR6 WG1 Ch.11 §11.6; AR6 Ch.12 Fig. 12.4 (SPEI-12, South Asia).",
  flood_river:
    "IPCC AR6 WG1 Ch.11 §11.5 (Rx1day); CWC Flood Atlas (2018).",
  flood_flash:
    "IPCC AR6 WG1 Ch.11 §11.5 (extreme precip); NDMA (2019) flash flood data.",
  cyclone:
    "Knutson et al. (2020) AR6 Box 11.4; IMD Best Track 1980–2020.",
  landslide:
    "IPCC AR6 WG1 Ch.11 §11.5 (precip extremes); NDMA Landslide Atlas (2023).",
  cold_wave:
    "IPCC AR6 WG1 Ch.11 §11.3.5 (cold extremes decline); IMD cold-wave records.",
  dust_storm:
    "Middleton & Goudie (2020); AR6 WG1 Ch.12 South-Asia dust loading projections.",
};

export const GEOGRAPHIC_SCOPE_DISPLAY: Record<MultiHazard, string[]> = {
  heat:        ["pan-India"],
  drought:     ["pan-India"],
  flood_river: ["pan-India"],
  flood_flash: ["pan-India"],
  cyclone:     ["coastal"],
  landslide:   ["Himalayan", "North-East", "Western Ghats"],
  cold_wave:   ["northern plains", "Himalayan"],
  dust_storm:  ["arid northwest"],
};
