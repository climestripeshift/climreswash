/**
 * Stress-test seeder — v0 synthetic projections
 *
 * Method: AR6 WG1 Chapter 12 South-Asia regional temperature/precip deltas are
 * applied as scalar multipliers to each district's baseline hazard exposure.
 * Sensitivity and Adaptive Capacity are frozen at current district values (v1 plan:
 * let adaptive capacity evolve along the SSP socioeconomic pathway).
 *
 * Stated limitations (tell funders up-front):
 *   1. Static sensitivity / adaptive capacity — understates risk where population grows fastest.
 *   2. Flood proxied via extreme-precip delta, not hydrological inundation modelling.
 *   3. Compound / correlated hazards (heat + drought co-occurrence) not jointly modelled.
 *
 * Sources:
 *   IPCC AR6 WG1, Chapter 12: Climate Change Information for Regional Impact and
 *   Risk Assessment (2021). South Asia temperature change table, Table 12.SM.1.
 *   Scenario mapping: SSP5-8.5 ≈ Current Policies, SSP2-4.5 ≈ NDCs, SSP1-2.6 ≈ Net Zero 2050.
 */

import { storage } from "./storage";
import type { InsertHazardProjection, InsertVulnerabilityProjection } from "@shared/schema";

// AR6 South-Asia exposure-delta fractions per (scenario, year, hazard)
// Values = proportional increase over 1995–2014 baseline exposure
const DELTAS: Record<string, Record<number, Record<string, number>>> = {
  current_policies: {      // SSP5-8.5 / SSP3-7.0
    2025: { heat: 0.00, drought: 0.00, flood: 0.00 },
    2030: { heat: 0.10, drought: 0.06, flood: 0.05 },
    2040: { heat: 0.22, drought: 0.16, flood: 0.13 },
    2050: { heat: 0.35, drought: 0.25, flood: 0.20 },
  },
  ndc: {                   // SSP2-4.5 → SSP3-7.0
    2025: { heat: 0.00, drought: 0.00, flood: 0.00 },
    2030: { heat: 0.07, drought: 0.04, flood: 0.03 },
    2040: { heat: 0.12, drought: 0.10, flood: 0.08 },
    2050: { heat: 0.20, drought: 0.15, flood: 0.12 },
  },
  net_zero_2050: {         // SSP1-2.6 / SSP1-1.9
    2025: { heat: 0.00, drought: 0.00, flood: 0.00 },
    2030: { heat: 0.03, drought: 0.02, flood: 0.02 },
    2040: { heat: 0.05, drought: 0.03, flood: 0.03 },
    2050: { heat: 0.08, drought: 0.05, flood: 0.05 },
  },
};

// Inter-model spread (std dev as fraction of raw value) per scenario
const SPREAD: Record<string, number> = {
  current_policies: 0.12,
  ndc: 0.08,
  net_zero_2050: 0.05,
};

const SCENARIOS = Object.keys(DELTAS);
const YEARS = [2025, 2030, 2040, 2050];
const HAZARDS = ['heat', 'drought', 'flood'] as const;

const CMIP6_MODELS = [
  'ACCESS-CM2', 'MPI-ESM1-2-HR', 'MIROC6', 'CNRM-CM6-1', 'IPSL-CM6A-LR',
];

const SOURCE =
  'AR6 WG1 Ch.12 South-Asia regional projections (IPCC, 2021); ' +
  'SSP5-8.5 (Current Policies), SSP2-4.5 (NDCs), SSP1-2.6 (Net Zero). ' +
  'v0: scalar deltas applied to district baseline exposure. ' +
  'NEX-GDDP-CMIP6 district-level downscaling planned for v1.';

const HAZARD_WEIGHTS = { heat: 1 / 3, drought: 1 / 3, flood: 1 / 3 };

/** Derive a 0–1 baseline exposure score per hazard for a district */
function baselineExposure(
  district: {
    hazardScore: number | null;
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

  // Fall back: scale district hazardScore by whether this hazard is in climateRisks
  const base = Math.max(0, Math.min(district.hazardScore ?? 0.5, 1));
  const hazardInProfile =
    hazard === 'heat'
      ? district.climateRisks.some(r => /heat|heatwave/i.test(r))
      : hazard === 'drought'
      ? district.climateRisks.some(r => /drought|water|groundwater/i.test(r))
      : district.climateRisks.some(r => /flood/i.test(r));

  return hazardInProfile ? base * 0.9 : base * 0.5;
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
          const base = baselineExposure(
            { hazardScore: d.hazardScore, climateRisks: d.climateRisks, hazardIntensities: d.hazardIntensities as any },
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

  // Track vulnerability values so we can compute deterioration + avoidedDamage
  // vMap[districtId][scenario][year] = vulnerability
  const vMap: Map<string, Map<string, Map<number, number>>> = new Map();
  // exposureMap[districtId][scenario][year] = { composite, breakdown }
  type ExposureEntry = { composite: number; breakdown: Record<string, number> };
  const expMap: Map<string, Map<string, Map<number, ExposureEntry>>> = new Map();

  for (const d of allDistricts) {
    const sensitivity = Math.max(d.vulnerabilityScore ?? 0.5, 0.01);
    const adaptiveCap = Math.max((d.adaptationScore ?? 50) / 100, 0.05);

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

        const vulnerability = (composite * sensitivity) / adaptiveCap;

        syVMap.set(year, vulnerability);
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
    const sensitivity = Math.max(d.vulnerabilityScore ?? 0.5, 0.01);
    const adaptiveCap = Math.max((d.adaptationScore ?? 50) / 100, 0.05);

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
          sensitivity,
          adaptiveCap,
          vulnerability:     v,
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
