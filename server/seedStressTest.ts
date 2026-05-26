/**
 * Stress-test seeder — v0 synthetic projections
 *
 * Method: IPCC AR6 Risk = Hazard × Exposure × Vulnerability.
 * Only the Hazard term varies by scenario and year; Exposure and Vulnerability
 * are frozen at present-day district values (v0).
 *   H(district, hazard, scenario, year) = baseline_hazard(district, hazard) × (1 + delta)
 *   E = district.exposureScore          (frozen)
 *   V = district.vulnerabilityScore     (frozen)
 * Three hazard channels (heat, drought, flood) combined by geometric mean → H composite.
 * v1 plan: let E and V evolve along the SSP socioeconomic pathway.
 *
 * Stated limitations (tell funders up-front):
 *   1. Static Exposure and Vulnerability — understates risk where population grows fastest.
 *   2. Flood proxied via extreme-precip delta, not hydrological inundation modelling.
 *   3. Compound / correlated hazards (heat + drought co-occurrence) not jointly modelled.
 *
 * All numeric delta values and citations live in stressTestConfig.ts — do not add
 * hardcoded climate numbers here.
 */

import { storage } from "./storage";
import type { InsertHazardProjection, InsertVulnerabilityProjection } from "@shared/schema";
import {
  DELTAS, SPREAD, SCENARIOS, YEARS, HAZARDS,
  CMIP6_MODELS, SOURCE_TEXT as SOURCE, HAZARD_WEIGHTS,
} from "./stressTestConfig";

/** Derive a 0–1 baseline Hazard intensity for a district (the H term in Risk = H × E × V) */
function baselineHazard(
  district: {
    hazardScore: number | null;
    exposureScore: number | null;
    climateRisks: string[];
    hazardIntensities: Record<string, number> | null;
  },
  hazard: 'heat' | 'drought' | 'flood'
): number {
  const intensities = district.hazardIntensities ?? {};

  // Try stored per-hazard intensity first
  const intensityKey =
    hazard === 'heat' ? ['heat', 'Extreme Heat', 'Heatwave', 'Heat Stress'] :
    hazard === 'drought' ? ['drought', 'Drought', 'Agricultural Drought', 'Water Scarcity', 'Groundwater Depletion'] :
    ['flood', 'Flood', 'Flash Floods', 'Monsoon Flooding'];

  for (const k of intensityKey) {
    if (typeof intensities[k] === 'number') return Math.min(intensities[k], 1);
  }

  const hazardInProfile =
    hazard === 'heat'
      ? district.climateRisks.some(r => /heat|heatwave/i.test(r))
      : hazard === 'drought'
      ? district.climateRisks.some(r => /drought|water|groundwater/i.test(r))
      : district.climateRisks.some(r => /flood/i.test(r));

  if (district.hazardScore != null) {
    // Authoritative hazard score available: scale by in-profile flag
    const base = Math.max(0, Math.min(district.hazardScore, 1));
    return hazardInProfile ? base * 0.9 : base * 0.5;
  }

  // No hazardScore (CVI import doesn't set it). Use exposureScore as a regional
  // climate-stress proxy — high-exposure districts are typically in more hazard-prone
  // areas. Then apply a larger penalty for hazards absent from the district's
  // climate risk profile so inter-district spread is meaningful.
  const regionProxy = Math.max(0.15, Math.min(district.exposureScore ?? 0.4, 0.85));
  return hazardInProfile ? regionProxy * 0.8 : regionProxy * 0.25;
}

/** Geometric mean of three values with equal weights */
function geometricMean(h: number, d: number, f: number): number {
  // Clamp to avoid log(0)
  const hc = Math.max(h, 1e-6);
  const dc = Math.max(d, 1e-6);
  const fc = Math.max(f, 1e-6);
  return Math.pow(hc * dc * fc, 1 / 3);
}

export async function computeStressTestProjections(): Promise<{ districts: number; rows: number }> {
  const allDistricts = await storage.getAllDistricts();
  if (allDistricts.length === 0) {
    throw new Error('No districts in database — seed districts first.');
  }

  // ── Step 1: compute all raw hazard values ────────────────────────────────
  // raw[districtId][scenario][year][hazard] = rawValue
  type RawMap = Map<string, Map<string, Map<number, Map<string, number>>>>;
  const raw: RawMap = new Map();

  for (const d of allDistricts) {
    const byScenario = new Map<string, Map<number, Map<string, number>>>();
    for (const scenario of SCENARIOS) {
      const byYear = new Map<number, Map<string, number>>();
      for (const year of YEARS) {
        const byHazard = new Map<string, number>();
        for (const hazard of HAZARDS) {
          const base = baselineHazard(
            { hazardScore: d.hazardScore, exposureScore: d.exposureScore, climateRisks: d.climateRisks, hazardIntensities: d.hazardIntensities as any },
            hazard
          );
          const delta = DELTAS[scenario][year][hazard];
          byHazard.set(hazard, base * (1 + delta));
        }
        byYear.set(year, byHazard);
      }
      byScenario.set(scenario, byYear);
    }
    raw.set(d.id, byScenario);
  }

  // ── Step 2: global min–max per hazard (across all districts, scenarios, years) ──
  const hazardMins: Record<string, number> = { heat: Infinity, drought: Infinity, flood: Infinity };
  const hazardMaxs: Record<string, number> = { heat: -Infinity, drought: -Infinity, flood: -Infinity };

  for (const byScenario of Array.from(raw.values())) {
    for (const byYear of Array.from(byScenario.values())) {
      for (const byHazard of Array.from(byYear.values())) {
        for (const hazard of HAZARDS) {
          const v = byHazard.get(hazard)!;
          if (v < hazardMins[hazard]) hazardMins[hazard] = v;
          if (v > hazardMaxs[hazard]) hazardMaxs[hazard] = v;
        }
      }
    }
  }

  function normalise(v: number, hazard: string): number {
    const range = hazardMaxs[hazard] - hazardMins[hazard];
    return range < 1e-9 ? 0 : (v - hazardMins[hazard]) / range;
  }

  // ── Step 3: build DB row arrays ───────────────────────────────────────────
  const hazardRows: InsertHazardProjection[] = [];
  const vulnRows: InsertVulnerabilityProjection[] = [];

  // Track risk values (H × E × V) for deterioration + avoidedDamage
  // vMap[districtId][scenario][year] = risk
  const vMap: Map<string, Map<string, Map<number, number>>> = new Map();
  // exposureMap[districtId][scenario][year] = { composite, breakdown }
  type ExposureEntry = { composite: number; breakdown: Record<string, number> };
  const expMap: Map<string, Map<string, Map<number, ExposureEntry>>> = new Map();

  for (const d of allDistricts) {
    // AR6 Risk = H × E × V — E and V frozen at present-day values
    const exposure    = Math.max(d.exposureScore ?? 0.5, 0.01);       // E term
    const vulnFactor  = Math.max(d.vulnerabilityScore ?? 0.5, 0.01);  // V term

    const dvMap = new Map<string, Map<number, number>>();
    const deMap = new Map<string, Map<number, ExposureEntry>>();

    for (const scenario of SCENARIOS) {
      const syVMap = new Map<number, number>();
      const syEMap = new Map<number, ExposureEntry>();

      for (const year of YEARS) {
        const byHazard = raw.get(d.id)!.get(scenario)!.get(year)!;
        const nHeat   = normalise(byHazard.get('heat')!,   'heat');
        const nDrought = normalise(byHazard.get('drought')!, 'drought');
        const nFlood  = normalise(byHazard.get('flood')!,  'flood');

        const composite = geometricMean(nHeat, nDrought, nFlood);

        // Per-hazard share for breakdown tooltip
        const total = nHeat + nDrought + nFlood || 1;
        const breakdown: Record<string, number> = {
          heat:    nHeat   / total,
          drought: nDrought / total,
          flood:   nFlood  / total,
        };

        const risk = composite * exposure * vulnFactor;  // Risk = H × E × V

        syVMap.set(year, risk);
        syEMap.set(year, { composite, breakdown });

        // Push hazard rows
        for (const hazard of HAZARDS) {
          const rv = byHazard.get(hazard)!;
          const nv = hazard === 'heat' ? nHeat : hazard === 'drought' ? nDrought : nFlood;
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

  // ── Step 4: build vulnerability_projections rows with deterioration / avoidedDamage ──
  for (const d of allDistricts) {
    const exposure    = Math.max(d.exposureScore ?? 0.5, 0.01);       // E term
    const vulnFactor  = Math.max(d.vulnerabilityScore ?? 0.5, 0.01);  // V term

    // Baseline = current_policies @ 2025 (delta = 0, so scenario doesn't matter at 2025)
    const baseline2025 = vMap.get(d.id)!.get('current_policies')!.get(2025)!;
    const cp2050       = vMap.get(d.id)!.get('current_policies')!.get(2050)!;
    const nz2050       = vMap.get(d.id)!.get('net_zero_2050')!.get(2050)!;
    const avoidedDamage2050 = cp2050 - nz2050;

    for (const scenario of SCENARIOS) {
      for (const year of YEARS) {
        const v = vMap.get(d.id)!.get(scenario)!.get(year)!;
        const { composite, breakdown } = expMap.get(d.id)!.get(scenario)!.get(year)!;

        vulnRows.push({
          districtId:        d.id,
          scenario,
          horizonYear:       year,
          exposureComposite: composite,
          sensitivity:       vulnFactor,  // V term: district.vulnerabilityScore
          adaptiveCap:       exposure,    // E term: district.exposureScore (column repurposed)
          vulnerability:     v,           // Risk = H_composite × E × V
          deterioration:     v - baseline2025,
          // avoidedDamage is the same for every row of this district (it's a 2050 stat)
          // but storing it here means the frontend can read it in any row
          avoidedDamage:     avoidedDamage2050,
          hazardWeights:     HAZARD_WEIGHTS,
          hazardBreakdown:   breakdown,
        });
      }
    }
  }

  // ── Step 5: write to DB ──────────────────────────────────────────────────
  await storage.clearProjections();
  await storage.bulkInsertHazardProjections(hazardRows);
  await storage.bulkInsertVulnerabilityProjections(vulnRows);

  return { districts: allDistricts.length, rows: hazardRows.length + vulnRows.length };
}
