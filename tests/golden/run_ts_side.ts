/**
 * TS side of the golden parity test: computes Tier-1 (pure formula vectors)
 * and Tier-2 (25 real hexes, shared weather scenario) outputs from
 * client/src/lib/simulatorFormulas.ts, and writes them to
 * tests/golden/ts_results.json for compare.py to diff against the Python side.
 *
 * Run standalone: npx tsx tests/golden/run_ts_side.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  pluvialFloodScore, heatwaveScore, droughtScore, wetBulbScore, exposureScore,
  floodSensitivity, heatSensitivity, computeRisk, scoreHexBreakdown,
  HexProp, SimInputs,
} from "../../client/src/lib/simulatorFormulas";

const GOLDEN_DIR = dirname(fileURLToPath(import.meta.url));
const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

function runTier1(vectors: any) {
  return {
    pluvial_flood_score: vectors.pluvial_flood_score.map((v: number[]) => round(pluvialFloodScore(v[0], v[1], v[2], v[3]))),
    heatwave_score: vectors.heatwave_score.map((v: number[]) => round(heatwaveScore(v[0], v[1], v[2], v[3], v[4], v[5]))),
    drought_score: vectors.drought_score.map((v: number) => round(droughtScore(v))),
    wet_bulb_score: vectors.wet_bulb_score.map((v: number[]) => round(wetBulbScore(v[0], v[1]))),
    exposure_score: vectors.exposure_score.map((v: number[]) => round(exposureScore(v[0], v[1], v[2], v[3]))),
    flood_sensitivity: vectors.flood_sensitivity.map((v: number[]) => round(floodSensitivity(v[0], v[1], v[2], v[3]))),
    heat_sensitivity: vectors.heat_sensitivity.map((v: number[]) => round(heatSensitivity(v[0], v[1], v[2]))),
    compute_risk: vectors.compute_risk.map((v: number[]) => round(computeRisk(v[0], v[1], v[2], v[3]))),
  };
}

function toHexProp(props: any): HexProp {
  return {
    h3_id: props.h3_id, state: props.state, district_name: props.district_name,
    land_use: props.land_use, ndvi_mean: props.ndvi_mean ?? 0.3,
    population: props.population ?? 0,
    pop_children_under_5: props.pop_children_under_5 ?? 0,
    pop_elderly_60plus: props.pop_elderly_60plus ?? 0,
    pop_women_15_49: props.pop_women_15_49 ?? 0,
    adaptive_capacity: props.adaptive_capacity ?? null,
    flood_risk: props.flood_risk ?? 0, heat_risk: props.heat_risk ?? 0,
    drought_risk: props.drought_risk ?? 0, wetbulb_risk: props.wetbulb_risk ?? 0,
    cyclone_risk: props.cyclone_risk ?? 0, landslide_risk: props.landslide_risk ?? 0,
    coldwave_risk: props.coldwave_risk ?? 0, hex_risk: props.hex_risk ?? 0,
  };
}

function runTier2(hexesWithScenario: any[], scenario: any, stateAc: Record<string, number>) {
  return hexesWithScenario.map((h) => {
    const hex = toHexProp(h.props);
    const inputs: SimInputs = {
      rainfall_mm: scenario.rainfall_mm, tmax_c: scenario.tmax_c,
      hot_days: scenario.hot_days, rh_pct: h.rh_pct,
    };
    const b = scoreHexBreakdown(hex, inputs, stateAc);
    return {
      category: h.category, h3_id: h.props.h3_id, district: h.props.district_name, state: h.props.state,
      inputs: {
        exposure_10: round(b.exposure, 3), ac: round(b.ac, 4),
        tree_pct: round(b.treePct, 1), sand_pct: round(b.sandPct, 1), built_pct: round(b.builtPct, 1),
      },
      sensitivity: { flood: round(b.floodSens, 4), heat: round(b.heatSens, 4) },
      hazard: { flood: round(b.floodHazard, 4), heat: round(b.heatHazard, 4), wetbulb: round(b.wbHazard, 4) },
      risk: { flood: round(b.floodRisk, 4), heat: round(b.heatRisk, 4), wetbulb: round(b.wbRisk, 4) },
    };
  });
}

function main() {
  const scenarioDef = JSON.parse(readFileSync(join(GOLDEN_DIR, "scenario.json"), "utf-8"));
  const hexesWithScenario = JSON.parse(readFileSync(join(GOLDEN_DIR, "hexes_with_scenario.json"), "utf-8"));
  const stateAcRaw = JSON.parse(readFileSync(join(GOLDEN_DIR, "..", "..", "client/public/data/state_ac.json"), "utf-8"));

  const tier1 = runTier1(scenarioDef.tier1_vectors);
  const tier2 = runTier2(hexesWithScenario, scenarioDef.tier2_scenario, stateAcRaw);

  writeFileSync(join(GOLDEN_DIR, "ts_results.json"), JSON.stringify({ tier1, tier2 }, null, 1));
  const tier1Count = Object.values(tier1).reduce((s: number, v: any) => s + v.length, 0);
  console.log(`TS side: wrote tier1 (${tier1Count} values) + tier2 (${tier2.length} hexes) to ts_results.json`);
}

main();
