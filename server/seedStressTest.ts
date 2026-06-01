/**
 * Stress-test seeder — v1 projections
 *
 * RISK FORMULA
 * ────────────
 * Risk = HazardTerm × Exposure × Vulnerability
 *
 * where HazardTerm = geometric_mean over {heat, drought, flood} of:
 *   H(district, hazard, scenario, year)
 *   × L(state, hazard, scenario, year)
 *   × S(district, hazard)
 *
 *   H  = Hazard intensity — district baseline (from NDMA/india.json) scaled by
 *         AR6 delta. Reflects HOW INTENSE the climate event is.
 *   L  = Likelihood — annual probability the hazard occurs, from state-level config.
 *         Also projected forward (extremes become more frequent under higher SSPs).
 *   S  = Severity — how bad the consequences are when the hazard hits, derived
 *         from district WASH and health indicators (water access, IMR, malnutrition).
 *   E  = Exposure (district.exposureScore from CVI) — people/assets in harm's way.
 *   V  = Vulnerability = sensitivityScore × (1 − adaptiveCapacity) — susceptibility
 *         to harm. Distinct from Exposure; uses CVI sensitivity sub-component.
 *
 * Each hazard term (H×L×S) is globally min-max normalised across all districts,
 * scenarios, and years before the geometric mean, preserving cross-scenario
 * temporal comparability.
 *
 * All numeric parameters live in stressTestConfig.ts — do not add hardcoded
 * climate numbers here.
 *
 * STATED LIMITATIONS (v1)
 * ───────────────────────
 * 1. L (likelihood) is set at state level from published hazard atlases —
 *    district-level return-period data planned for v2.
 * 2. S (severity) is proxied from WASH/health indicators; direct damage-function
 *    modelling planned for v2.
 * 3. E and V are frozen at present-day CVI values; SSP socioeconomic pathway
 *    evolution planned for v2.
 * 4. Compound hazard co-occurrence (heat + drought) not jointly modelled in v1.
 */

import fs from "fs";
import path from "path";
import { storage } from "./storage";
import type { InsertHazardProjection, InsertVulnerabilityProjection, InsertMultiHazardProjection } from "@shared/schema";
import {
  DELTAS, SPREAD, SCENARIOS, YEARS, HAZARDS,
  CMIP6_MODELS, SOURCE_TEXT as SOURCE, HAZARD_WEIGHTS,
  LIKELIHOOD, LIKELIHOOD_DELTAS,
} from "./stressTestConfig";
import type { Hazard } from "./stressTestConfig";
import {
  MULTI_HAZARDS,
  HAZARD_WEIGHTS_8,
  SEVERITY_WEIGHTS,
  INTERACTION_DATA,
  GEOGRAPHIC_SCOPE,
  getLikelihood,
  getLikelihoodDelta,
  getHazardDelta,
} from "./multiHazardConfig";
import type { MultiHazard } from "./multiHazardConfig";
import { seedHazardTaxonomy } from "./seedHazardTaxonomy";

// ── District-state lookup (authoritative; avoids relying on stateId DB column) ──
const DISTRICT_STATE_MAP: Record<string, { state: string; name: string }> = (() => {
  const p = path.resolve("client/public/data/districtStateMap.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
})();

function getState(districtId: string, fallbackStateId: string): string {
  return DISTRICT_STATE_MAP[districtId]?.state ?? fallbackStateId;
}

// ── Normalise a 0–100 or 0–1 value to 0–1 ────────────────────────────────────
function norm01(v: number | null, fallback: number): number {
  if (v == null) return fallback;
  return v > 1 ? v / 100 : v;
}

// ── H: district baseline hazard intensity for one hazard type ─────────────────
// Uses hazardScore populated by fix:district-hazards (from india.json NDMA data).
// Scales by whether the hazard is listed as a primary climate risk for the district:
//   - in profile → full baseline (hazard is known to affect this district)
//   - not in profile → 55% (hazard exists at regional level but not district-primary)
function baselineH(
  district: { hazardScore: number | null; climateRisks: string[] },
  hazard: Hazard
): number {
  const geoHazard = Math.max(district.hazardScore ?? 0.25, 0);
  const inProfile =
    hazard === "heat"
      ? district.climateRisks.some((r) => /heat|heatwave/i.test(r))
      : hazard === "drought"
      ? district.climateRisks.some((r) => /drought|water|groundwater/i.test(r))
      : district.climateRisks.some((r) => /flood/i.test(r));
  return geoHazard * (inProfile ? 1.0 : 0.55);
}

// ── S: severity — impact magnitude when the hazard strikes ───────────────────
// Derived from district WASH and health indicators (all on 0–100 scale in DB).
// Weights reflect which indicators most amplify each hazard's impact:
//   heat    → water access + child health burden
//   drought → water scarcity + food insecurity (stunting)
//   flood   → sanitation disruption + waterborne disease burden
function deriveSeverity(
  district: {
    waterAccessPercent: number;
    toiletCoveragePercent: number;
    infantMortalityRate: number;
    malnutritionStunting: number;
    malnutritionWasting: number;
  },
  hazard: Hazard
): number {
  const waterVuln  = 1 - (district.waterAccessPercent   / 100);
  const toiletVuln = 1 - (district.toiletCoveragePercent / 100);
  const imrNorm    = Math.min(district.infantMortalityRate  / 80, 1);  // 80 IMR ≈ upper bound
  const stuntNorm  = Math.min(district.malnutritionStunting / 60, 1);  // 60% ≈ upper bound
  const wastNorm   = Math.min(district.malnutritionWasting  / 30, 1);  // 30% ≈ upper bound

  switch (hazard) {
    case "heat":
      return 0.40 * waterVuln + 0.35 * imrNorm + 0.25 * wastNorm;
    case "drought":
      return 0.45 * waterVuln + 0.35 * stuntNorm + 0.20 * toiletVuln;
    case "flood":
      return 0.50 * toiletVuln + 0.30 * imrNorm + 0.20 * waterVuln;
  }
}

// ── V: vulnerability = sensitivity × (1 − adaptive capacity) ─────────────────
// sensitivityScore and adaptationScore from CVI are on 0–1 scale.
// Seed-only districts (no CVI) may have adaptationScore 0–100; norm01 handles both.
// Fallback: use vulnerabilityScore as a proxy when sensitivityScore is absent.
function computeV(district: {
  sensitivityScore: number | null;
  adaptationScore: number;
  vulnerabilityScore: number;
}): number {
  const adaptNorm = norm01(district.adaptationScore, 0.4);
  if (district.sensitivityScore != null) {
    const sensNorm = norm01(district.sensitivityScore, 0.4);
    return Math.max(sensNorm * (1 - adaptNorm), 1e-3);
  }
  // Fallback: composite vulnerability reduced by adaptive capacity
  return Math.max(norm01(district.vulnerabilityScore, 0.4) * (1 - adaptNorm * 0.5), 1e-3);
}

// ── Geometric mean of three values ───────────────────────────────────────────
function geometricMean(a: number, b: number, c: number): number {
  return Math.pow(Math.max(a, 1e-6) * Math.max(b, 1e-6) * Math.max(c, 1e-6), 1 / 3);
}

// ── Main compute function ──────────────────────────────────────────────────────

export async function computeStressTestProjections(): Promise<{ districts: number; rows: number }> {
  const allDistricts = await storage.getAllDistricts();
  if (allDistricts.length === 0) {
    throw new Error("No districts in database — seed districts first.");
  }

  // ── Step 1: compute raw hazard terms (H × L × S) per district/scenario/year/hazard ──
  // raw[districtId][scenario][year][hazard] = H × L × S (unnormalised)
  type RawMap = Map<string, Map<string, Map<number, Map<string, number>>>>;
  const raw: RawMap = new Map();

  for (const d of allDistricts) {
    const state = getState(d.id, d.stateId);
    const stateLikelihood = LIKELIHOOD[state] ?? LIKELIHOOD["DEFAULT"];

    const byScenario = new Map<string, Map<number, Map<string, number>>>();

    for (const scenario of SCENARIOS) {
      const byYear = new Map<number, Map<string, number>>();

      for (const year of YEARS) {
        const byHazard = new Map<string, number>();

        for (const hazard of HAZARDS) {
          // H: projected intensity
          const H = baselineH(d, hazard) * (1 + DELTAS[scenario][year][hazard]);

          // L: projected likelihood (capped at 1.0)
          const L = Math.min(
            stateLikelihood[hazard] * (1 + LIKELIHOOD_DELTAS[hazard][scenario][year]),
            1.0
          );

          // S: severity from WASH/health
          const S = deriveSeverity(
            {
              waterAccessPercent:    d.waterAccessPercent    ?? 60,
              toiletCoveragePercent: d.toiletCoveragePercent ?? 50,
              infantMortalityRate:   d.infantMortalityRate   ?? 35,
              malnutritionStunting:  d.malnutritionStunting  ?? 25,
              malnutritionWasting:   d.malnutritionWasting   ?? 15,
            },
            hazard
          );

          byHazard.set(hazard, H * L * S);
        }
        byYear.set(year, byHazard);
      }
      byScenario.set(scenario, byYear);
    }
    raw.set(d.id, byScenario);
  }

  // ── Step 2: global min–max normalisation per hazard ───────────────────────
  // Normalise across ALL districts × scenarios × years so scores are comparable.
  const mins: Record<string, number> = { heat: Infinity, drought: Infinity, flood: Infinity };
  const maxs: Record<string, number> = { heat: -Infinity, drought: -Infinity, flood: -Infinity };

  for (const byScenario of Array.from(raw.values())) {
    for (const byYear of Array.from(byScenario.values())) {
      for (const byHazard of Array.from(byYear.values())) {
        for (const hazard of HAZARDS) {
          const v = byHazard.get(hazard)!;
          if (v < mins[hazard]) mins[hazard] = v;
          if (v > maxs[hazard]) maxs[hazard] = v;
        }
      }
    }
  }

  function normalise(v: number, hazard: string): number {
    const range = maxs[hazard] - mins[hazard];
    return range < 1e-9 ? 0 : (v - mins[hazard]) / range;
  }

  // ── Step 3: build DB row arrays ───────────────────────────────────────────
  const hazardRows: InsertHazardProjection[] = [];
  const vulnRows: InsertVulnerabilityProjection[] = [];

  // vMap[districtId][scenario][year] = risk
  const vMap: Map<string, Map<string, Map<number, number>>> = new Map();
  // expMap[districtId][scenario][year] = { composite, breakdown }
  type ExpEntry = { composite: number; breakdown: Record<string, number> };
  const expMap: Map<string, Map<string, Map<number, ExpEntry>>> = new Map();

  for (const d of allDistricts) {
    const E = Math.max(norm01(d.exposureScore, 0.4), 0.01);
    const V = computeV(d);

    const dvMap = new Map<string, Map<number, number>>();
    const deMap = new Map<string, Map<number, ExpEntry>>();

    for (const scenario of SCENARIOS) {
      const syVMap = new Map<number, number>();
      const syEMap = new Map<number, ExpEntry>();

      for (const year of YEARS) {
        const byHazard = raw.get(d.id)!.get(scenario)!.get(year)!;
        const nHeat    = normalise(byHazard.get("heat")!,   "heat");
        const nDrought = normalise(byHazard.get("drought")!, "drought");
        const nFlood   = normalise(byHazard.get("flood")!,  "flood");

        const composite = geometricMean(nHeat, nDrought, nFlood);

        // Per-hazard contribution shares (for breakdown display)
        const total = nHeat + nDrought + nFlood || 1;
        const breakdown: Record<string, number> = {
          heat:    nHeat    / total,
          drought: nDrought / total,
          flood:   nFlood   / total,
        };

        const risk = composite * E * V;  // Risk = HazardTerm × Exposure × Vulnerability

        syVMap.set(year, risk);
        syEMap.set(year, { composite, breakdown });

        // Raw hazard rows (store pre-normalised value too)
        for (const hazard of HAZARDS) {
          const rv = byHazard.get(hazard)!;
          const nv = hazard === "heat" ? nHeat : hazard === "drought" ? nDrought : nFlood;
          hazardRows.push({
            districtId:  d.id,
            scenario,
            horizonYear: year,
            hazard,
            rawValue:    rv,
            normValue:   nv,
            modelSpread: rv * SPREAD[scenario],
            cmip6Models: CMIP6_MODELS,
            source:      SOURCE,
          });
        }
      }
      dvMap.set(scenario, syVMap);
      deMap.set(scenario, syEMap);
    }
    vMap.set(d.id, dvMap);
    expMap.set(d.id, deMap);
  }

  // ── Step 4: build vulnerability_projections rows ──────────────────────────
  for (const d of allDistricts) {
    const E = Math.max(norm01(d.exposureScore, 0.4), 0.01);
    const V = computeV(d);

    const baseline2025 = vMap.get(d.id)!.get("current_policies")!.get(2025)!;
    const cp2050       = vMap.get(d.id)!.get("current_policies")!.get(2050)!;
    const nz2050       = vMap.get(d.id)!.get("net_zero_2050")!.get(2050)!;
    const avoidedDamage2050 = cp2050 - nz2050;

    for (const scenario of SCENARIOS) {
      for (const year of YEARS) {
        const risk = vMap.get(d.id)!.get(scenario)!.get(year)!;
        const { composite, breakdown } = expMap.get(d.id)!.get(scenario)!.get(year)!;

        vulnRows.push({
          districtId:        d.id,
          scenario,
          horizonYear:       year,
          exposureComposite: composite,   // normalised H×L×S composite
          sensitivity:       V,           // Vulnerability term
          adaptiveCap:       E,           // Exposure term
          vulnerability:     risk,        // Risk = HazardTerm × E × V
          deterioration:     risk - baseline2025,
          avoidedDamage:     avoidedDamage2050,
          hazardWeights:     HAZARD_WEIGHTS,
          hazardBreakdown:   breakdown,
        });
      }
    }
  }

  // ── Step 5: persist (upsert — don't clear first so a failed run keeps old data) ──
  await storage.bulkInsertHazardProjections(hazardRows);
  await storage.bulkInsertVulnerabilityProjections(vulnRows);

  return { districts: allDistricts.length, rows: hazardRows.length + vulnRows.length };
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-HAZARD COMPOUND-RISK PROJECTIONS — 8 hazards + Gill & Malamud interactions
// ══════════════════════════════════════════════════════════════════════════════
//
// Formula
// ───────
// Per hazard h:
//   Risk(h) = L(h) × (1 + ΔL(h,s,y)) × H(h) × (1 + ΔH(h,s,y)) × S(h,d) × V(d)
//   where H(h) = baselineH × geographic_scope_factor  (same baselineH as v1)
//         S(h,d) = SEVERITY_WEIGHTS[h] dot-product with normalised WASH/health indicators
//         V(d) = sensitivityScore × (1 − adaptationScore)
//
// All Risk(h) values are globally min-max normalised per hazard across all
// districts/scenarios/years before aggregation.
//
// Composite (additive weighted sum + Gill & Malamud interaction terms):
//   Risk_total = Σ_h  w(h) × Risk_norm(h)
//              + Σ_{i<j} max(M(i,j)/2, 0) × sqrt(Risk_norm(i) × Risk_norm(j))
//
// Only positive interaction codes contribute (negative ones are inhibiting —
// the primary risk formula already models "no hazard present" implicitly).
// ══════════════════════════════════════════════════════════════════════════════

function deriveSeverityMulti(
  d: {
    waterAccessPercent: number;
    toiletCoveragePercent: number;
    handwashingFacilityPercent: number;
    infantMortalityRate: number;
    malnutritionStunting: number;
    malnutritionWasting: number;
    maternalMortalityRatio: number;
  },
  hazard: MultiHazard
): number {
  const w = SEVERITY_WEIGHTS[hazard];
  const waterVuln  = 1 - Math.min(d.waterAccessPercent / 100, 1);
  const toiletVuln = 1 - Math.min(d.toiletCoveragePercent / 100, 1);
  const hwVuln     = 1 - Math.min(d.handwashingFacilityPercent / 100, 1);
  const imrNorm    = Math.min(d.infantMortalityRate / 80, 1);
  const stuntNorm  = Math.min(d.malnutritionStunting / 60, 1);
  const wastNorm   = Math.min(d.malnutritionWasting / 30, 1);
  const mmrNorm    = Math.min(d.maternalMortalityRatio / 500, 1);

  return (
    w.waterVuln  * waterVuln +
    w.toiletVuln * toiletVuln +
    w.hwVuln     * hwVuln +
    w.imrNorm    * imrNorm +
    w.stuntNorm  * stuntNorm +
    w.wastNorm   * wastNorm +
    w.mmrNorm    * mmrNorm
  );
}

// Geographic scope factor: 1.0 if hazard is primary for this state, else 0.0
// (OUT_OF_SCOPE_L baseline is already built into getLikelihood)
function geoFactor(hazard: MultiHazard, state: string): 1 | 0 {
  const scope = GEOGRAPHIC_SCOPE[hazard];
  if (scope === "ALL") return 1;
  return scope.includes(state) ? 1 : 0;
}

export async function computeMultiHazardProjections(): Promise<{ districts: number; rows: number }> {
  const allDistricts = await storage.getAllDistricts();
  if (allDistricts.length === 0) {
    throw new Error("No districts in database — seed districts first.");
  }

  // Auto-seed taxonomy + interaction matrix (idempotent)
  await seedHazardTaxonomy();

  // Build interaction lookup: M[i][j] = qualitative code (-2…+2)
  const M: Map<string, number> = new Map();
  for (const e of INTERACTION_DATA) {
    M.set(`${e.i}::${e.j}`, e.code);
  }
  function getInteraction(i: MultiHazard, j: MultiHazard): number {
    return M.get(`${i}::${j}`) ?? 0;
  }

  // ── Step 1: raw Risk(h) per district/scenario/year/hazard ─────────────────
  // raw[districtId][scenario][year][hazard] = L × H × S × V (unnormalised)
  type RawMap = Map<string, Map<string, Map<number, Map<MultiHazard, number>>>>;
  const raw: RawMap = new Map();

  for (const d of allDistricts) {
    const state = DISTRICT_STATE_MAP[d.id]?.state ?? d.stateId;

    const S_indicators = {
      waterAccessPercent:        d.waterAccessPercent    ?? 60,
      toiletCoveragePercent:     d.toiletCoveragePercent ?? 50,
      handwashingFacilityPercent: d.handwashingFacilityPercent ?? 40,
      infantMortalityRate:       d.infantMortalityRate   ?? 35,
      malnutritionStunting:      d.malnutritionStunting  ?? 25,
      malnutritionWasting:       d.malnutritionWasting   ?? 15,
      maternalMortalityRatio:    d.maternalMortalityRatio ?? 130,
    };

    const adaptNorm = norm01(d.adaptationScore, 0.4);
    const V = d.sensitivityScore != null
      ? Math.max(norm01(d.sensitivityScore, 0.4) * (1 - adaptNorm), 1e-3)
      : Math.max(norm01(d.vulnerabilityScore, 0.4) * (1 - adaptNorm * 0.5), 1e-3);

    const baseH = Math.max(d.hazardScore ?? 0.25, 0);

    const byScenario = new Map<string, Map<number, Map<MultiHazard, number>>>();

    for (const scenario of SCENARIOS) {
      const byYear = new Map<number, Map<MultiHazard, number>>();

      for (const year of YEARS) {
        const byHazard = new Map<MultiHazard, number>();

        for (const hazard of MULTI_HAZARDS) {
          const L = Math.min(
            getLikelihood(state, hazard) * (1 + getLikelihoodDelta(hazard, scenario, year)),
            1.0
          );
          const H = baseH * geoFactor(hazard, state) * Math.max(1 + getHazardDelta(hazard, scenario, year), 0);
          const S = deriveSeverityMulti(S_indicators, hazard);

          byHazard.set(hazard, L * H * S * V);
        }
        byYear.set(year, byHazard);
      }
      byScenario.set(scenario, byYear);
    }
    raw.set(d.id, byScenario);
  }

  // ── Step 2: global min-max normalisation per hazard ───────────────────────
  const mins: Record<MultiHazard, number> = {} as any;
  const maxs: Record<MultiHazard, number> = {} as any;
  for (const h of MULTI_HAZARDS) { mins[h] = Infinity; maxs[h] = -Infinity; }

  for (const byScenario of Array.from(raw.values())) {
    for (const byYear of Array.from(byScenario.values())) {
      for (const byHazard of Array.from(byYear.values())) {
        for (const h of MULTI_HAZARDS) {
          const v = byHazard.get(h)!;
          if (v < mins[h]) mins[h] = v;
          if (v > maxs[h]) maxs[h] = v;
        }
      }
    }
  }

  function normH(v: number, h: MultiHazard): number {
    const range = maxs[h] - mins[h];
    return range < 1e-9 ? 0 : (v - mins[h]) / range;
  }

  // ── Step 3: build multiHazardProjections rows ─────────────────────────────
  const rows: InsertMultiHazardProjection[] = [];

  for (const d of allDistricts) {
    for (const scenario of SCENARIOS) {
      for (const year of YEARS) {
        const byHazard = raw.get(d.id)!.get(scenario)!.get(year)!;

        const perHazardNorm: Record<string, number> = {};
        for (const h of MULTI_HAZARDS) {
          perHazardNorm[h] = normH(byHazard.get(h)!, h);
        }

        // Weighted sum
        let weightedSum = 0;
        for (const h of MULTI_HAZARDS) {
          weightedSum += HAZARD_WEIGHTS_8[h] * perHazardNorm[h];
        }

        // Additive Gill & Malamud interaction terms (positive only)
        let interactionSum = 0;
        for (let a = 0; a < MULTI_HAZARDS.length; a++) {
          for (let b = a + 1; b < MULTI_HAZARDS.length; b++) {
            const hi = MULTI_HAZARDS[a];
            const hj = MULTI_HAZARDS[b];
            // Symmetric interaction: use max(M(i,j), M(j,i)) to capture bidirectional
            const code = Math.max(getInteraction(hi, hj), getInteraction(hj, hi));
            if (code <= 0) continue;  // inhibiting or independent — skip
            const contribution = (code / 2) * Math.sqrt(perHazardNorm[hi] * perHazardNorm[hj]);
            interactionSum += contribution;
          }
        }

        const compositeRisk = weightedSum + interactionSum;

        // Dominant hazard = highest normalised Risk(h)
        let dominantH: MultiHazard = "heat";
        let dominantV = -Infinity;
        for (const h of MULTI_HAZARDS) {
          if (perHazardNorm[h] > dominantV) {
            dominantV = perHazardNorm[h];
            dominantH = h;
          }
        }

        rows.push({
          districtId:              d.id,
          scenario,
          horizonYear:             year,
          perHazardRisk:           perHazardNorm,
          compositeRisk,
          interactionContribution: interactionSum,
          dominantHazard:          dominantH,
          aggregationMethod:       "weighted_sum_plus_gill_malamud",
        });
      }
    }
  }

  // ── Step 4: persist ───────────────────────────────────────────────────────
  await storage.bulkInsertMultiHazardProjections(rows);

  return { districts: allDistricts.length, rows: rows.length };
}
