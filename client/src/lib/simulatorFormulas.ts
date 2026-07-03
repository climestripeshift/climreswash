/**
 * Present-day hazard formulas — TypeScript port of scripts/risk/formulas.py
 * Used by the What-If Risk Simulator ONLY. Do NOT use in the future/2050 engine.
 */

// Land-use params from compute_future_days.py (same defaults used there)
const LAND_USE_PARAMS: Record<string, { tree_pct: number; built_pct: number; sand_pct: number }> = {
  tree:     { tree_pct: 75, built_pct: 2,  sand_pct: 20 },
  shrub:    { tree_pct: 30, built_pct: 3,  sand_pct: 35 },
  grass:    { tree_pct: 10, built_pct: 5,  sand_pct: 30 },
  crop:     { tree_pct: 8,  built_pct: 10, sand_pct: 25 },
  built:    { tree_pct: 5,  built_pct: 70, sand_pct: 15 },
  barren:   { tree_pct: 1,  built_pct: 2,  sand_pct: 75 },
  water:    { tree_pct: 0,  built_pct: 0,  sand_pct: 10 },
  wetland:  { tree_pct: 15, built_pct: 2,  sand_pct: 10 },
  snow:     { tree_pct: 0,  built_pct: 0,  sand_pct: 5  },
  mangrove: { tree_pct: 60, built_pct: 0,  sand_pct: 15 },
};
const DEFAULT_LU = LAND_USE_PARAMS.crop;

// Defaults for missing hex_props fields (slope_deg, dist_water_m not stored)
const DEFAULT_SLOPE = 3.0;    // degrees (India mixed-terrain national avg; 1.0 hits drainage floor)
const DEFAULT_DIST_WATER = 5000; // metres

// ── 1. Pluvial flood score (§1 — IMD lookup table) ──────────────────────────

const RAIN_TABLE: [number, number][] = [
  [0.0, 0.0], [7.5, 2.0], [35.5, 4.0], [64.5, 6.0], [124.5, 8.0], [244.4, 10.0],
];

function rainBase(mm: number): number {
  if (mm <= 0) return 0;
  if (mm >= RAIN_TABLE[RAIN_TABLE.length - 1][0]) return RAIN_TABLE[RAIN_TABLE.length - 1][1];
  for (let i = 0; i < RAIN_TABLE.length - 1; i++) {
    const [loR, loS] = RAIN_TABLE[i];
    const [hiR, hiS] = RAIN_TABLE[i + 1];
    if (loR <= mm && mm <= hiR) {
      const t = (mm - loR) / (hiR - loR);
      return loS + t * (hiS - loS);
    }
  }
  return 0;
}

function pluvialFloodScore(mm: number, sand: number, built: number, slope: number): number {
  const base = rainBase(mm);
  const infiltration = (sand / 100) * (1 - built / 100);
  const drainage = Math.max(0.3, slope / 5);
  const amplifier = (1 - 0.6 * infiltration) / drainage;
  return Math.min(10, base * amplifier);
}

// ── 2. Heatwave score (§2) ───────────────────────────────────────────────────

function heatwaveScore(
  tmax: number, threshold: number, days: number,
  built: number, tree: number, distWater: number,
): number {
  const excess = Math.max(0, tmax - threshold);
  const dur = Math.min(days, 5);
  const base = (excess / 8) * (dur / 5) * 10;
  const urbanAmp = 1 + 0.3 * (built / 100);
  const vegCool  = 1 - 0.2 * (tree / 100);
  const waterCool = 1 - 0.1 * Math.exp(-distWater / 3000);
  return Math.min(10, base * urbanAmp * vegCool * waterCool);
}

// ── 3. Drought score (§3) ────────────────────────────────────────────────────

function droughtScore(spi: number): number {
  return Math.max(0, Math.min(10, -spi * 5));
}

// ── 4. Wet-bulb score (§4 — Stull 2011 approx) ──────────────────────────────

function wetBulbTemp(t: number, rh: number): number {
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(t + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035
  );
}

function wetBulbScore(t: number, rh: number): number {
  return Math.max(0, Math.min(10, (wetBulbTemp(t, rh) - 28) * 10 / 7));
}

// ── 5. Exposure score (§6) ───────────────────────────────────────────────────

function exposureScore(pop: number, ch5pct: number, el60pct: number, w1549pct: number): number {
  if (pop <= 0) return 0;
  const vulnFrac = ch5pct + el60pct + w1549pct * 0.3;
  return Math.min(10, Math.log10(pop) * 2 * (1 + vulnFrac / 100));
}

// ── 6. Sensitivity functions (§7) ────────────────────────────────────────────

function floodSensitivity(slope: number, sand: number, built: number, distWater: number): number {
  return (
    0.3 * (1 - slope / 30)
    + 0.3 * (1 - sand / 100)
    + 0.2 * (built / 100)
    + 0.2 * Math.exp(-distWater / 2000)
  );
}

function heatSensitivity(tree: number, built: number, distWater: number): number {
  return (
    0.4 * (built / 100)
    + 0.3 * (1 - tree / 100)
    + 0.3 * (1 - Math.exp(-distWater / 3000))
  );
}

// ── 7. Master risk equation (§9–10) ──────────────────────────────────────────

function computeRisk(hazard: number, exposure: number, sensitivity: number, ac: number): number {
  const acDampening = Math.max(0.2, 1 - hazard / 12);
  const effectiveAc = ac * acDampening;
  const risk = (hazard * exposure * sensitivity) * (1 - effectiveAc) / 10;
  return Math.max(0, Math.min(10, risk));
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface SimInputs {
  rainfall_mm: number;
  tmax_c: number;
  hot_days: number;
  spi: number;
  rh_pct: number;
}

export interface HexProp {
  h3_id: string;
  state: string;
  district_name: string;
  land_use: string;
  ndvi_mean: number;
  population: number;
  pop_children_under_5: number;
  pop_elderly_60plus: number;
  pop_women_15_49: number;
  adaptive_capacity: number;
  flood_risk: number;
  heat_risk: number;
  drought_risk: number;
  wetbulb_risk: number;
  cyclone_risk: number;
  landslide_risk: number;
  coldwave_risk: number;
  hex_risk: number;
}

/**
 * Re-score a hex under a user-specified climate scenario.
 * Uses present-day formulas with land-use proxies for missing terrain fields.
 * Hazards NOT controlled by sliders (cyclone, landslide, coldwave) pass through unchanged.
 */
export function reScoreHex(hex: HexProp, inputs: SimInputs): number {
  const pop = hex.population || 1;
  const lu = LAND_USE_PARAMS[hex.land_use] ?? DEFAULT_LU;

  // tree_pct: blend land-use default with NDVI signal
  const treePct = Math.max(lu.tree_pct, hex.ndvi_mean * 80);

  // Per-hex exposure (population + vulnerability demographics)
  const ch5pct   = (hex.pop_children_under_5 / pop) * 100;
  const el60pct  = (hex.pop_elderly_60plus   / pop) * 100;
  const w1549pct = (hex.pop_women_15_49      / pop) * 100;
  const exp = exposureScore(pop, ch5pct, el60pct, w1549pct);

  // Sensitivity (terrain defaults for missing fields)
  const floodSens = floodSensitivity(DEFAULT_SLOPE, lu.sand_pct, lu.built_pct, DEFAULT_DIST_WATER);
  const heatSens  = heatSensitivity(treePct, lu.built_pct, DEFAULT_DIST_WATER);

  const ac = hex.adaptive_capacity;

  // Flood
  const floodHazard = pluvialFloodScore(inputs.rainfall_mm, lu.sand_pct, lu.built_pct, DEFAULT_SLOPE);
  const floodRisk   = computeRisk(floodHazard, exp, floodSens, ac);

  // Heat
  const heatHazard = heatwaveScore(inputs.tmax_c, 40, inputs.hot_days, lu.built_pct, treePct, DEFAULT_DIST_WATER);
  const heatRisk   = computeRisk(heatHazard, exp, heatSens, ac);

  // Drought — terrain-adaptive sensitivity (aligns to backtest_events.py:184 validated formula)
  // Live engine (join_hex_districts.py:330) also uses this formula + GW stress; we omit GW here.
  const droughtSens = Math.min(1.0, 0.5 + 0.3 * (1 - hex.ndvi_mean) + 0.2 * (lu.sand_pct / 100));
  const droughtRisk = computeRisk(droughtScore(inputs.spi), exp, droughtSens, ac);

  // Wet-bulb (uses tmax_c and rh_pct)
  const wbRisk = computeRisk(wetBulbScore(inputs.tmax_c, inputs.rh_pct), exp, heatSens, ac);

  // Pass-through: hazards not controlled by sliders
  const passThrough = Math.max(
    hex.cyclone_risk   ?? 0,
    hex.landslide_risk ?? 0,
    hex.coldwave_risk  ?? 0,
  );

  return Math.min(10, Math.max(floodRisk, heatRisk, droughtRisk, wbRisk, passThrough));
}
