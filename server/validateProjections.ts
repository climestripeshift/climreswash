/**
 * Sanity-check script: top-10 deterioration districts, Current Policies 2050
 *
 * Run after computing projections:
 *   npx tsx server/validateProjections.ts
 *
 * Physical-intuition check: arid, high-heat districts (western Rajasthan,
 * Gujarat, parts of Haryana) should dominate the top 10 because they have
 * both high baseline heat hazard and the largest SSP5-8.5 delta.
 * If coastal or high-altitude districts dominate instead, check delta
 * application in seedStressTest.ts and baseline hazard fallback logic.
 */

import { storage } from "./storage";

// States expected near the top for heat/drought (not exhaustive — just a signal)
const ARID_HEAT_STATES = new Set(['RJ', 'GJ', 'HR', 'PB', 'MH', 'MP', 'UP', 'TN', 'AP', 'TS']);

function bar(fractions: Record<string, number>, width = 20): string {
  const symbols: Record<string, string> = { heat: '█', drought: '▓', flood: '░' };
  let result = '';
  for (const [hazard, frac] of Object.entries(fractions)) {
    const len = Math.round(frac * width);
    result += (symbols[hazard] ?? '?').repeat(len);
  }
  return result.padEnd(width);
}

async function main() {
  const rows = await storage.getProjectionRankings('current_policies', 2050, 'deterioration', 10);

  if (rows.length === 0) {
    console.error('\n  No projection rows found. Run "Compute v0 Projections" first.\n');
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('  TOP 10 DISTRICTS — DETERIORATION  |  Current Policies (SSP5-8.5)  |  2050');
  console.log('  Deterioration = Risk(2050) − Risk(baseline 2025)');
  console.log('  Hazard bar: █ heat  ▓ drought  ░ flood');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  console.log(
    '  Rank  District                   State   Deterioration   Risk@2050   Hazard share'
  );
  console.log('  ────  ─────────────────────────  ─────   ─────────────   ─────────   ────────────────────');

  let aridCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rank    = String(i + 1).padStart(4);
    const name    = r.districtName.padEnd(25).slice(0, 25);
    const state   = (r.stateId ?? '??').padEnd(5);
    const detrFmt = (r.deterioration ?? 0).toFixed(4).padStart(13);
    const riskFmt = (r.vulnerability ?? 0).toFixed(4).padStart(9);
    const breakdown = (r.hazardBreakdown as Record<string, number>) ?? {};
    const hazardViz = bar(breakdown);
    const flag = ARID_HEAT_STATES.has(r.stateId ?? '') ? ' ✓' : '  ';

    console.log(`  ${rank}  ${name}  ${state}  ${detrFmt}   ${riskFmt}   ${hazardViz}${flag}`);
    if (ARID_HEAT_STATES.has(r.stateId ?? '')) aridCount++;
  }

  console.log('\n  ✓ = state in expected arid/high-heat set (RJ GJ HR PB MH MP UP TN AP TS)\n');

  // Verdict
  const topState = rows[0]?.stateId ?? '?';
  if (aridCount >= 7) {
    console.log(`  ✅ PASS: ${aridCount}/10 top districts are in high-heat states — physically plausible.\n`);
  } else if (aridCount >= 4) {
    console.log(`  ⚠️  PARTIAL: ${aridCount}/10 in high-heat states. Check whether coastal/humid districts`);
    console.log(`     have anomalously high exposureScore or vulnerabilityScore pulling them up.\n`);
  } else {
    console.log(`  ❌ SUSPECT: only ${aridCount}/10 in high-heat states. Top district is ${topState}.`);
    console.log(`     Likely causes:`);
    console.log(`       1. hazardIntensities missing for arid districts → fallback gives 0.5*0.5=0.25 (heat absent)`);
    console.log(`       2. exposureScore / vulnerabilityScore skewed — check district seed data`);
    console.log(`       3. Delta application bug in seedStressTest.ts step 1\n`);
  }

  // Per-district diagnostics for the #1 and #10 entries
  console.log('  ── Diagnostics (first and last entry) ──────────────────────────────────────\n');
  for (const r of [rows[0], rows[rows.length - 1]].filter(Boolean)) {
    const bd = (r.hazardBreakdown as Record<string, number>) ?? {};
    console.log(`  ${r.districtName} (${r.stateId})`);
    console.log(`    Risk@2050       : ${(r.vulnerability ?? 0).toFixed(6)}`);
    console.log(`    Deterioration   : ${(r.deterioration ?? 0).toFixed(6)}`);
    console.log(`    H composite     : ${(r.exposureComposite ?? 0).toFixed(6)}  (normalised geometric mean)`);
    console.log(`    E (exposure)    : ${(r.adaptiveCap ?? 0).toFixed(4)}  (district.exposureScore, frozen v0)`);
    console.log(`    V (vuln)        : ${(r.sensitivity ?? 0).toFixed(4)}  (district.vulnerabilityScore, frozen v0)`);
    console.log(`    Hazard shares   : heat ${((bd.heat ?? 0) * 100).toFixed(1)}%  drought ${((bd.drought ?? 0) * 100).toFixed(1)}%  flood ${((bd.flood ?? 0) * 100).toFixed(1)}%`);
    console.log(`    Avoided damage  : ${(r.avoidedDamage ?? 0).toFixed(6)}  (CP2050 − NZ2050 for this district)\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n  Error:', err.message, '\n');
  process.exit(1);
});
