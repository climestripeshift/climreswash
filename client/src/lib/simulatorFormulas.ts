/**
 * Present-day hazard formulas — TypeScript port of scripts/risk/formulas.py
 * Used by the What-If Risk Simulator ONLY. Do NOT use in the future/2050 engine.
 */

// Land-use params from compute_future_days.py (same defaults used there)
export const LAND_USE_PARAMS: Record<string, { tree_pct: number; built_pct: number; sand_pct: number }> = {
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

// Fallbacks used ONLY when a hex has no real slope_deg/dist_water_m at all
// (should be rare -- 100% coverage in india_hex_props.json today) -- see
// estimateSlope()/estimateDistWater() below, which are the actual per-hex
// fallback hex_risk.py uses (elevation-bucket estimates), ported here for
// parity (see chat, golden-test Fix 2). DEFAULT_SLOPE/DEFAULT_DIST_WATER are
// now a last-resort only (missing elevation_mean too), not the everyday path
// they used to be.
export const DEFAULT_SLOPE = 3.0;    // degrees (India mixed-terrain national avg; 1.0 hits drainage floor)
export const DEFAULT_DIST_WATER = 5000; // metres

// Ported from scripts/risk/hex_risk.py's estimate_slope()/estimate_dist_water()
// -- the real elevation-bucket fallback hex_risk.py uses when a hex has no
// slope_deg/dist_water_m measurement, NOT what reScoreHex used to fall back
// to (a single flat constant regardless of terrain).
export function estimateSlope(elev: number): number {
  if (elev > 3000) return 25.0;
  if (elev > 1500) return 15.0;
  if (elev > 800) return 8.0;
  if (elev > 300) return 3.0;
  if (elev > 100) return 1.0;
  return 0.5;
}

export function estimateDistWater(lu: string, elev: number): number {
  if (lu === "water" || lu === "wetland" || lu === "mangrove") return 100.0;
  if (elev < 30) return 500.0;
  if (elev < 100) return 1500.0;
  if (elev < 300) return 3000.0;
  return 5000.0;
}

// Groundwater-stress AC penalty (see chat, golden-test Fix 1) -- same
// constants as hex_risk.py's AC_GW_PENALTY/GW_DEFAULT.
export const AC_GW_PENALTY = 0.2;
export const GW_DEFAULT = 0.1;

// ── 1. Pluvial flood score (§1 — IMD lookup table) ──────────────────────────

const RAIN_TABLE: [number, number][] = [
  [0.0, 0.0], [7.5, 2.0], [35.5, 4.0], [64.5, 6.0], [124.5, 8.0], [244.4, 10.0],
];

export function rainBase(mm: number): number {
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

export function pluvialFloodScore(mm: number, sand: number, built: number, slope: number): number {
  const base = rainBase(mm);
  const infiltration = (sand / 100) * (1 - built / 100);
  const drainage = Math.max(0.3, slope / 5);
  const amplifier = (1 - 0.6 * infiltration) / drainage;
  return Math.min(10, base * amplifier);
}

// ── 2. Heatwave score (§2) ───────────────────────────────────────────────────

export function heatwaveScore(
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

export function droughtScore(spi: number): number {
  return Math.max(0, Math.min(10, -spi * 5));
}

// ── 4. Wet-bulb score (§4 — Stull 2011 approx) ──────────────────────────────

export function wetBulbTemp(t: number, rh: number): number {
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(t + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035
  );
}

export function wetBulbScore(t: number, rh: number): number {
  return Math.max(0, Math.min(10, (wetBulbTemp(t, rh) - 28) * 10 / 7));
}

// ── 5. Exposure score (§6) ───────────────────────────────────────────────────

export function exposureScore(pop: number, ch5pct: number, el60pct: number, w1549pct: number): number {
  if (pop <= 0) return 0;
  const vulnFrac = ch5pct + el60pct + w1549pct * 0.3;
  return Math.min(10, Math.log10(pop) * 2 * (1 + vulnFrac / 100));
}

// ── 6. Sensitivity functions (§7) ────────────────────────────────────────────

export function floodSensitivity(slope: number, sand: number, built: number, distWater: number): number {
  // BUG FIX (same as formulas.py Bug 3, see chat): slope term used to go
  // negative for slope > 30 -- dormant here too (DEFAULT_SLOPE=3.0 always,
  // never reaches 30), but fixing the formula itself while in this file.
  const val = (
    0.3 * Math.max(0, 1 - slope / 30)
    + 0.3 * (1 - sand / 100)
    + 0.2 * (built / 100)
    + 0.2 * Math.exp(-distWater / 2000)
  );
  return Math.max(0, Math.min(1, val));
}

export function heatSensitivity(tree: number, built: number, distWater: number): number {
  return (
    0.4 * (built / 100)
    + 0.3 * (1 - tree / 100)
    + 0.3 * (1 - Math.exp(-distWater / 3000))
  );
}

// ── 7. Master risk equation (§9–10) ──────────────────────────────────────────

export function computeRisk(hazard: number, exposure: number, sensitivity: number, ac: number): number {
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
  rh_pct: number;
  // spi removed — drought is now derived per-hex from rainfall deficit vs local NDVI-based normal
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
  adaptive_capacity: number | null;
  flood_risk: number;
  heat_risk: number;
  drought_risk: number;
  wetbulb_risk: number;
  cyclone_risk: number;
  landslide_risk: number;
  coldwave_risk: number;
  hex_risk: number;
  // Real per-hex terrain/groundwater fields (see chat, golden-test Fix 1/Fix 2)
  // -- all optional/nullable since india_hex_props.json coverage varies:
  // elevation_mean/slope_deg/dist_water_m/dist_to_river_km/gw_stress_score are
  // 100% populated; real_sand_pct is currently 0% populated client-side (a
  // separate, unfixed sync_hex_risk_to_props.py gap -- present in the geojson
  // pipeline scripts read but never copied into the props file the client
  // fetches) so its real-value branch below is presently always the land-use
  // fallback in production, same as before this fix, until that gap is closed.
  elevation_mean?: number | null;
  slope_deg?: number | null;
  dist_water_m?: number | null;
  dist_to_river_km?: number | null;
  real_sand_pct?: number | null;
  gw_stress_score?: number | null;
}

export interface HexScoreBreakdown {
  exposure: number; ac: number; treePct: number; sandPct: number; builtPct: number;
  floodSens: number; heatSens: number; droughtSens: number;
  floodHazard: number; heatHazard: number; wbHazard: number; droughtHazard: number;
  floodRisk: number; heatRisk: number; wbRisk: number; droughtRisk: number;
  passThrough: number; combined: number;
}

/**
 * Per-channel breakdown behind reScoreHex() -- split out (see chat, Part 2
 * golden test) so a test harness can inspect flood/heat/wetbulb/drought
 * hazard, sensitivity, exposure, and AC individually against hex_risk.py's
 * equivalents, instead of only the single blended max() reScoreHex returns.
 * Pure extraction: reScoreHex()'s return value is unchanged (verified).
 */
export function scoreHexBreakdown(hex: HexProp, inputs: SimInputs, stateAc: Record<string, number>): HexScoreBreakdown {
  // Population fallback (see chat, golden-test Fix 2): hex_risk.py falls back
  // a missing/zero population to 10000 ("unknown, assume moderate"), not 1 --
  // `|| 1` here used to silently zero out exposure (log10(1)=0) for every
  // real, legitimate zero-population hex (glaciers, open water, salt flats --
  // confirmed on the Kachchh/Kargil hexes the golden test's ts=0 cases came
  // from). `|| 10000` matches hex_risk.py's actual fallback exactly.
  const pop = hex.population || 10000;
  const lu = LAND_USE_PARAMS[hex.land_use] ?? DEFAULT_LU;

  // tree_pct: blend land-use default with NDVI signal
  const treePct = Math.max(lu.tree_pct, hex.ndvi_mean * 80);

  // Per-hex exposure (population + vulnerability demographics)
  const ch5pct   = (hex.pop_children_under_5 / pop) * 100;
  const el60pct  = (hex.pop_elderly_60plus   / pop) * 100;
  const w1549pct = (hex.pop_women_15_49      / pop) * 100;
  const exp = exposureScore(pop, ch5pct, el60pct, w1549pct);

  // Real per-hex terrain inputs (see chat, golden-test Fix 2), same
  // resolution order as hex_risk.py's resolve_static_hex_inputs():
  // real value if present and nonzero, else the elevation-bucket estimate
  // (estimateSlope/estimateDistWater above), else the flat national default
  // only if elevation itself is also missing. real_sand_pct is currently
  // always absent client-side (see HexProp comment) so sandPct resolves to
  // the land-use guess in production today, same as before this fix -- the
  // real-value branch is here and correct, just unreachable until that
  // separate sync gap is closed.
  const elev = hex.elevation_mean ?? 200;
  const slope = (hex.slope_deg || 0) || estimateSlope(elev) || DEFAULT_SLOPE;
  const distW = (hex.dist_water_m || 0) || estimateDistWater(hex.land_use, elev) || DEFAULT_DIST_WATER;
  const sandPct = hex.real_sand_pct != null ? hex.real_sand_pct : lu.sand_pct;
  // Bug-6 river-aware water distance (see chat) -- min of real OSM river
  // distance and nearest-water-hex distance, used for heat/wet-bulb only
  // (flood/drought keep distW), same as hex_risk.py.
  const distRiverKm = hex.dist_to_river_km != null ? hex.dist_to_river_km : 999.0;
  const distWHeat = Math.min(distRiverKm * 1000, distW);

  const floodSens = floodSensitivity(slope, sandPct, lu.built_pct, distW);
  const heatSens  = heatSensitivity(treePct, lu.built_pct, distWHeat);

  // Null-safe AC (same fallback logic as hex_risk.py Fix A): null/undefined
  // or a genuinely near-zero value falls back to the real state-level
  // average, never to 0.
  const acMissing = hex.adaptive_capacity == null || Number.isNaN(hex.adaptive_capacity);
  const acBase = (acMissing || hex.adaptive_capacity! < 0.05)
    ? (stateAc[hex.state] ?? 0.7)
    : hex.adaptive_capacity!;

  // Groundwater-stress AC penalty (see chat, golden-test Fix 1) -- same
  // formula and same "falsy collapses to default" semantics as hex_risk.py's
  // `gw_stress = row.get(...) or GW_DEFAULT` (a real gw_stress_score of
  // exactly 0 also falls back to GW_DEFAULT there, so `||` here matches that
  // behavior deliberately, not just for missing/undefined).
  const gwStress = hex.gw_stress_score || GW_DEFAULT;
  const ac = Math.max(0.1, acBase * (1 - AC_GW_PENALTY * gwStress));

  // Flood
  const floodHazard = pluvialFloodScore(inputs.rainfall_mm, sandPct, lu.built_pct, slope);
  const floodRisk   = computeRisk(floodHazard, exp, floodSens, ac);

  // Heat threshold (see chat, golden-test heat-threshold fix): hex_risk.py
  // uses `30.0 if elev > 800 else (37.0 if dist_coast < 50000 else 40.0)` --
  // high-altitude regions aren't heat-adapted, so "heatwave" kicks in lower.
  // Ported the elevation branch (the one explicitly asked for, and the one
  // that drove every heat-channel Tier-2b mismatch in the golden test --
  // Leh/Shimla/Kargil/Sikkim/NE hills, all elev>800). NOT ported: the
  // dist_coast<50000 -> 37 middle tier -- that needs a hex's lat/lon, which
  // isn't in HexProp or india_hex_props.json today (frontend reconstructs
  // hex geometry from h3_id via h3-js rather than storing coordinates), and
  // none of the current test hexes' mismatches are driven by that branch.
  // Flagging as a known, deliberate simplification, not a silent omission.
  const heatThreshold = elev > 800 ? 30.0 : 40.0;

  // Heat
  const heatHazard = heatwaveScore(inputs.tmax_c, heatThreshold, inputs.hot_days, lu.built_pct, treePct, distWHeat);
  const heatRisk   = computeRisk(heatHazard, exp, heatSens, ac);

  // Drought — per-hex deficit → SPI, then terrain-adaptive sensitivity
  // rain_normal proxied from NDVI (5–55 mm/day): same slider value means deficit in dry regions,
  // surplus in wet ones. Drought only fires on actual deficit (negative SPI).
  const rainNormal = 5 + hex.ndvi_mean * 50;
  const spiFromRain = Math.max(-3, Math.min(3, (inputs.rainfall_mm / rainNormal - 1) / 0.4));
  const droughtSens = Math.min(1.0, 0.5 + 0.3 * (1 - hex.ndvi_mean) + 0.2 * (sandPct / 100));
  const droughtHazard = spiFromRain < 0 ? droughtScore(spiFromRain) : 0;
  const droughtRisk = spiFromRain < 0
    ? computeRisk(droughtHazard, exp, droughtSens, ac)
    : 0;

  // Wet-bulb (uses tmax_c and rh_pct)
  const wbHazard = wetBulbScore(inputs.tmax_c, inputs.rh_pct);
  const wbRisk = computeRisk(wbHazard, exp, heatSens, ac);

  // Pass-through: hazards not controlled by sliders
  const passThrough = Math.max(
    hex.cyclone_risk   ?? 0,
    hex.landslide_risk ?? 0,
    hex.coldwave_risk  ?? 0,
  );

  // Water risk: dominant of flood (high rain) vs drought (low rain) — U-shaped curve
  const waterRisk = Math.max(floodRisk, droughtRisk);
  const combined = Math.min(10, Math.max(waterRisk, heatRisk, wbRisk, passThrough));

  return {
    exposure: exp, ac, treePct, sandPct: lu.sand_pct, builtPct: lu.built_pct,
    floodSens, heatSens, droughtSens,
    floodHazard, heatHazard, wbHazard, droughtHazard,
    floodRisk, heatRisk, wbRisk, droughtRisk,
    passThrough, combined,
  };
}

/**
 * Re-score a hex under a user-specified climate scenario.
 * Uses present-day formulas with land-use proxies for missing terrain fields.
 * Hazards NOT controlled by sliders (cyclone, landslide, coldwave) pass through unchanged.
 *
 * `stateAc` is required, not optional (see chat, null-AC audit): 280 hexes have
 * adaptive_capacity === null (districts genuinely absent from NFHS-5). Before
 * this fix, `const ac = hex.adaptive_capacity` read null straight through, and
 * `null * number` evaluates to 0 in JS -- every null-AC hex got treated as
 * having ZERO adaptive capacity, worse than even the pre-fix Python bug's 0.1
 * floor. Confirmed: 28 of the El Nino preset's 32 "flipped to HIGH RISK"
 * districts had 100% null-AC hexes -- an AC artifact, not a drought signal.
 * stateAc comes from client/public/data/state_ac.json, generated by directly
 * calling the same build_wash_state_context() hex_risk.py itself uses --
 * same numbers, not a re-derived approximation.
 */
export function reScoreHex(hex: HexProp, inputs: SimInputs, stateAc: Record<string, number>): number {
  return scoreHexBreakdown(hex, inputs, stateAc).combined;
}
