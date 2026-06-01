/**
 * Hand-worked unit validation for the 8-hazard compound-risk model.
 *
 * Tests helper functions, severity S(h,d), raw risk formula, and Gill &
 * Malamud composite aggregation against manually calculated ground-truth values
 * for a Barmer (Rajasthan)-like district under current_policies / 2050.
 *
 * Run with:  npm run validate:multi-hazard
 * Exit code: 0 if all assertions pass, 1 if any fail.
 */

import {
  getLikelihood,
  getHazardDelta,
  getLikelihoodDelta,
  SEVERITY_WEIGHTS,
  INTERACTION_DATA,
  MULTI_HAZARDS,
  GEOGRAPHIC_SCOPE,
  HAZARD_WEIGHTS_8,
} from "./multiHazardConfig.js";

// ── Assertion helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name: string, actual: number, expected: number, tol = 1e-5): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name}: expected ${expected.toFixed(8)}, got ${actual.toFixed(8)} (diff ${diff.toFixed(8)})`);
    failed++;
  }
}

function assertEq(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name}: expected ${String(expected)}, got ${String(actual)}`);
    failed++;
  }
}

// ── Section 1: getLikelihood ──────────────────────────────────────────────────
// Rajasthan: heat=0.90, drought=0.80, flood=0.20
// flood_river = flood×0.60 = 0.12; flood_flash = flood×0.40 = 0.08 (not hilly)
// Rajasthan is in LIKELIHOOD_NEW: cyclone=0.01, landslide=0.02, cold_wave=0.58, dust_storm=0.88

console.log("\n── 1. getLikelihood (Rajasthan) ──");
assert("heat",        getLikelihood("Rajasthan", "heat"),        0.90);
assert("drought",     getLikelihood("Rajasthan", "drought"),     0.80);
assert("flood_river", getLikelihood("Rajasthan", "flood_river"), 0.12);
assert("flood_flash", getLikelihood("Rajasthan", "flood_flash"), 0.08);
assert("cyclone",     getLikelihood("Rajasthan", "cyclone"),     0.01);
assert("landslide",   getLikelihood("Rajasthan", "landslide"),   0.02);
assert("cold_wave",   getLikelihood("Rajasthan", "cold_wave"),   0.58);
assert("dust_storm",  getLikelihood("Rajasthan", "dust_storm"),  0.88);

console.log("\n── 1b. getLikelihood — hilly-state boost (Uttarakhand flash flood) ──");
// Uttarakhand: flood=0.62, is in HILLY_STATES → flash = min(0.62×0.40×1.5, 0.95) = 0.372
assert("flood_flash Uttarakhand", getLikelihood("Uttarakhand", "flood_flash"), 0.62 * 0.40 * 1.5);

// ── Section 2: getHazardDelta (current_policies, 2050) ───────────────────────
// Values from HEAT_DELTAS / DROUGHT_DELTAS / FLOOD_DELTAS / DELTAS_NEW

console.log("\n── 2. getHazardDelta (current_policies, 2050) ──");
assert("heat",        getHazardDelta("heat",        "current_policies", 2050),  0.35);
assert("drought",     getHazardDelta("drought",     "current_policies", 2050),  0.25);
assert("flood_river", getHazardDelta("flood_river", "current_policies", 2050),  0.20);
assert("flood_flash", getHazardDelta("flood_flash", "current_policies", 2050),  0.20);
assert("cyclone",     getHazardDelta("cyclone",     "current_policies", 2050),  0.22);
assert("landslide",   getHazardDelta("landslide",   "current_policies", 2050),  0.20);
assert("cold_wave",   getHazardDelta("cold_wave",   "current_policies", 2050), -0.20);
assert("dust_storm",  getHazardDelta("dust_storm",  "current_policies", 2050),  0.28);

// ── Section 3: getLikelihoodDelta (current_policies, 2050) ───────────────────

console.log("\n── 3. getLikelihoodDelta (current_policies, 2050) ──");
assert("heat",        getLikelihoodDelta("heat",        "current_policies", 2050),  0.35);
assert("drought",     getLikelihoodDelta("drought",     "current_policies", 2050),  0.22);
assert("flood_river", getLikelihoodDelta("flood_river", "current_policies", 2050),  0.20);
assert("cyclone",     getLikelihoodDelta("cyclone",     "current_policies", 2050),  0.18);
assert("cold_wave",   getLikelihoodDelta("cold_wave",   "current_policies", 2050), -0.18);
assert("dust_storm",  getLikelihoodDelta("dust_storm",  "current_policies", 2050),  0.22);

// ── Section 4: Geographic scope ──────────────────────────────────────────────

console.log("\n── 4. Geographic scope ──");

function inScope(hazard: (typeof MULTI_HAZARDS)[number], state: string): boolean {
  const scope = GEOGRAPHIC_SCOPE[hazard];
  return scope === "ALL" || scope.includes(state);
}

assertEq("heat is ALL-scope (Rajasthan)",      inScope("heat",       "Rajasthan"),   true);
assertEq("dust_storm in scope (Rajasthan)",    inScope("dust_storm", "Rajasthan"),   true);
assertEq("cold_wave in scope (Rajasthan)",     inScope("cold_wave",  "Rajasthan"),   true);
assertEq("cyclone OUT OF scope (Rajasthan)",   inScope("cyclone",    "Rajasthan"),   false);
assertEq("landslide OUT OF scope (Rajasthan)", inScope("landslide",  "Rajasthan"),   false);
assertEq("cyclone in scope (Odisha)",          inScope("cyclone",    "Odisha"),      true);
assertEq("landslide in scope (Uttarakhand)",   inScope("landslide",  "Uttarakhand"), true);
assertEq("dust_storm OUT OF scope (Kerala)",   inScope("dust_storm", "Kerala"),      false);

// ── Section 5: Severity S(h, d) ──────────────────────────────────────────────
// Barmer-like district indicator values:
//   waterAccess=30%  → waterVuln = 0.70
//   toiletCoverage=40%  → toiletVuln = 0.60
//   handwashing=25%  → hwVuln = 0.75
//   IMR=64           → imrNorm = 64/80 = 0.80
//   stunting=48%     → stuntNorm = 48/60 = 0.80
//   wasting=18%      → wastNorm = 18/30 = 0.60
//   MMR=300          → mmrNorm = 300/500 = 0.60

console.log("\n── 5. Severity S(h, d) — Barmer-like indicators ──");

const IND = {
  waterAccessPercent:          30,
  toiletCoveragePercent:       40,
  handwashingFacilityPercent:  25,
  infantMortalityRate:         64,
  malnutritionStunting:        48,
  malnutritionWasting:         18,
  maternalMortalityRatio:      300,
};

const waterVuln  = 1 - Math.min(IND.waterAccessPercent          / 100, 1);  // 0.70
const toiletVuln = 1 - Math.min(IND.toiletCoveragePercent       / 100, 1);  // 0.60
const hwVuln     = 1 - Math.min(IND.handwashingFacilityPercent  / 100, 1);  // 0.75
const imrNorm    = Math.min(IND.infantMortalityRate    /  80, 1);            // 0.80
const stuntNorm  = Math.min(IND.malnutritionStunting   /  60, 1);            // 0.80
const wastNorm   = Math.min(IND.malnutritionWasting    /  30, 1);            // 0.60
const mmrNorm    = Math.min(IND.maternalMortalityRatio / 500, 1);            // 0.60

function sev(h: (typeof MULTI_HAZARDS)[number]): number {
  const w = SEVERITY_WEIGHTS[h];
  return (
    w.waterVuln  * waterVuln  +
    w.toiletVuln * toiletVuln +
    w.hwVuln     * hwVuln     +
    w.imrNorm    * imrNorm    +
    w.stuntNorm  * stuntNorm  +
    w.wastNorm   * wastNorm   +
    w.mmrNorm    * mmrNorm
  );
}

// S(heat)        = 0.35*0.70 + 0.05*0.60 + 0.05*0.75 + 0.30*0.80 + 0.05*0.80 + 0.15*0.60 + 0.05*0.60 = 0.7125
assert("S(heat)",        sev("heat"),        0.7125);
// S(drought)     = 0.40*0.70 + 0.15*0.60 + 0.05*0.75 + 0.10*0.80 + 0.25*0.80 + 0.05*0.60 + 0.00*0.60 = 0.7175
assert("S(drought)",     sev("drought"),     0.7175);
// S(flood_river) = 0.15*0.70 + 0.45*0.60 + 0.10*0.75 + 0.20*0.80 + 0.05*0.80 + 0.05*0.60 + 0.00*0.60 = 0.680
assert("S(flood_river)", sev("flood_river"), 0.680);
// S(cold_wave)   = 0.15*0.70 + 0.10*0.60 + 0.05*0.75 + 0.40*0.80 + 0.10*0.80 + 0.15*0.60 + 0.05*0.60 = 0.7225
assert("S(cold_wave)",   sev("cold_wave"),   0.7225);
// S(dust_storm)  = 0.25*0.70 + 0.05*0.60 + 0.15*0.75 + 0.40*0.80 + 0.05*0.80 + 0.05*0.60 + 0.05*0.60 = 0.7375
assert("S(dust_storm)",  sev("dust_storm"),  0.7375);

// ── Section 6: Raw risk formula (single district, pre-normalisation) ──────────
// District: Rajasthan, hazardScore=0.40, sensitivityScore=0.70, adaptationScore=0.30
//   V = norm01(0.70) × (1 − norm01(0.30)) = 0.70 × 0.70 = 0.49
// scenario=current_policies, year=2050
//
// Formula:  raw = L_eff × H_eff × S × V
//   L_eff = min(L_base × (1 + ΔL), 1.0)    ← capped at 1
//   H_eff = baseH × geoFactor × max(1 + ΔH, 0)
//
// NOTE: cyclone and landslide have geoFactor=0 for Rajasthan → H_eff=0 → raw=0

console.log("\n── 6. Raw risk L × H × S × V (Rajasthan, current_policies, 2050) ──");

const baseH = 0.40;
const V     = 0.70 * (1 - 0.30);  // 0.49

// heat: L_eff=min(0.90×1.35,1)=1.0; H_eff=0.40×1.35=0.54
// raw = 1.0 × 0.54 × 0.7125 × 0.49 = 0.188528 (L capped)
const rawHeat = 1.0 * (baseH * 1.35) * sev("heat") * V;
assert("raw heat (L capped at 1.0)",          rawHeat,      0.188528, 1e-4);

// drought: L_eff=min(0.80×1.22,1)=0.976; H_eff=0.40×1.25=0.50
// raw = 0.976 × 0.50 × 0.7175 × 0.49 = 0.171569
const rawDrought = (0.80 * 1.22) * (baseH * 1.25) * sev("drought") * V;
assert("raw drought",                          rawDrought,   0.171569, 1e-4);

// flood_river: L_eff=0.12×1.20=0.144; H_eff=0.40×1.20=0.48
// raw = 0.144 × 0.48 × 0.680 × 0.49 = 0.023031
const rawFloodRiver = (0.12 * 1.20) * (baseH * 1.20) * sev("flood_river") * V;
assert("raw flood_river",                      rawFloodRiver, 0.023031, 1e-4);

// cold_wave: L_eff=0.58×0.82=0.4756; H_eff=0.40×0.80=0.32 (negative deltas)
// raw = 0.4756 × 0.32 × 0.7225 × 0.49 = 0.053880
const rawColdWave = (0.58 * 0.82) * (baseH * 0.80) * sev("cold_wave") * V;
assert("raw cold_wave (negative deltas)",      rawColdWave,  0.053880, 1e-4);

// dust_storm: L_eff=min(0.88×1.22,1)=1.0 (capped); H_eff=0.40×1.28=0.512
// raw = 1.0 × 0.512 × 0.7375 × 0.49 = 0.185024
const rawDustStorm = 1.0 * (baseH * 1.28) * sev("dust_storm") * V;
assert("raw dust_storm (L capped at 1.0)",     rawDustStorm, 0.185024, 1e-4);

// cyclone: geoFactor=0 for Rajasthan → H_eff=0 → raw must equal 0
const rawCyclone = getLikelihood("Rajasthan", "cyclone") * 0 * sev("cyclone") * V;
assert("raw cyclone (out-of-scope, H=0)",      rawCyclone,   0.0);

// ── Section 7: Composite formula with known normalised values ─────────────────
// Heat+drought+dust_storm district scenario:
//   norm = { heat:0.9, drought:0.7, dust_storm:0.8, all others: 0 }
//
// Weighted sum = (0.9 + 0.7 + 0 + 0 + 0 + 0 + 0 + 0.8) / 8 = 2.4 / 8 = 0.300
//
// Positive interaction pairs (max of bidirectional codes > 0):
//   (heat, drought):     max(M(ht,dr)=+2, M(dr,ht)=+1) = +2 → (2/2)×√(0.9×0.7) = √0.63
//   (heat, dust_storm):  max(M(ht,ds)=+2, M(ds,ht)=+1) = +2 → √(0.9×0.8) = √0.72
//   (drought, dust_storm): max(M(dr,ds)=+2, M(ds,dr)=+1) = +2 → √(0.7×0.8) = √0.56
// All other pairs involve at least one zero → contribution = 0
//
// interaction sum = √0.63 + √0.72 + √0.56

console.log("\n── 7. Composite formula (hand-worked normalised values) ──");

const norm8: Record<(typeof MULTI_HAZARDS)[number], number> = {
  heat:        0.9,
  drought:     0.7,
  flood_river: 0.0,
  flood_flash: 0.0,
  cyclone:     0.0,
  landslide:   0.0,
  cold_wave:   0.0,
  dust_storm:  0.8,
};

// Build interaction lookup from INTERACTION_DATA (mirrors seedStressTest.ts)
const mcode = new Map<string, number>();
for (const e of INTERACTION_DATA) {
  mcode.set(`${e.i}::${e.j}`, e.code);
}
function getM(i: string, j: string): number {
  return mcode.get(`${i}::${j}`) ?? 0;
}

let weightedSum = 0;
for (const h of MULTI_HAZARDS) {
  weightedSum += HAZARD_WEIGHTS_8[h] * norm8[h];
}
assert("weighted sum = 2.4/8 = 0.300", weightedSum, 0.300);

let interactionSum = 0;
for (let a = 0; a < MULTI_HAZARDS.length; a++) {
  for (let b = a + 1; b < MULTI_HAZARDS.length; b++) {
    const hi = MULTI_HAZARDS[a];
    const hj = MULTI_HAZARDS[b];
    const code = Math.max(getM(hi, hj), getM(hj, hi));
    if (code <= 0) continue;
    interactionSum += (code / 2) * Math.sqrt(norm8[hi] * norm8[hj]);
  }
}

const expectedIx = Math.sqrt(0.9 * 0.7) + Math.sqrt(0.9 * 0.8) + Math.sqrt(0.7 * 0.8);
assert("interaction sum = √0.63 + √0.72 + √0.56", interactionSum, expectedIx, 1e-9);
assert("composite = 0.300 + interaction sum",       weightedSum + interactionSum, 0.300 + expectedIx, 1e-9);

// ── Section 8: INTERACTION_DATA coverage and spot-checks ─────────────────────
// Full directed matrix: 8 hazards × 7 peers = 56 directed pairs

console.log("\n── 8. Interaction data coverage & spot-checks ──");

assertEq("INTERACTION_DATA has 56 directed pairs",   INTERACTION_DATA.length, 56);
assertEq("M(heat, drought) = +2",                    getM("heat",        "drought"),      2);
assertEq("M(heat, cold_wave) = −2 (mutual exclusion)", getM("heat",      "cold_wave"),   -2);
assertEq("M(drought, heat) = +1 (soil feedback)",    getM("drought",     "heat"),          1);
assertEq("M(cyclone, flood_river) = +2 (trigger)",   getM("cyclone",     "flood_river"),  2);
assertEq("M(cyclone, landslide) = +2 (trigger)",     getM("cyclone",     "landslide"),    2);
assertEq("M(flood_river, dust_storm) = −2 (inhibit)", getM("flood_river", "dust_storm"), -2);
assertEq("M(drought, dust_storm) = +2 (trigger)",   getM("drought",      "dust_storm"),   2);

// ── Summary ──────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${"─".repeat(52)}`);
console.log(`Result: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
