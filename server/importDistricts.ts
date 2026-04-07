import { db } from "./db";
import { sql } from "drizzle-orm";
import * as path from "path";

function pgArray(arr: string[]): string {
  if (arr.length === 0) return "ARRAY[]::text[]";
  const escaped = arr.map(s => `'${s.replace(/'/g, "''")}'`).join(",");
  return `ARRAY[${escaped}]::text[]`;
}

function pgText(s: string): string {
  return `'${String(s ?? "").replace(/'/g, "''")}'`;
}

function pgNum(n: any, def = 0): string {
  const v = Number(n);
  return isNaN(v) ? String(def) : String(v);
}

async function main() {
  const XLSXPkg = await import("xlsx");
  const XLSX = (XLSXPkg.default || XLSXPkg) as any;

  const filePath = path.resolve("attached_assets/climadapt_districts_1775548071015.xlsx");
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  console.log(`[import] ${rows.length} rows to import`);

  let inserted = 0;
  let failed = 0;

  for (const r of rows) {
    try {
      const climateRisks: string[] = r.climateRisks
        ? String(r.climateRisks).split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      const adaptationStrategies: string[] = r.adaptationStrategies
        ? String(r.adaptationStrategies).split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];

      let seasonalData = "[]";
      try {
        if (r.seasonalData) {
          const raw = typeof r.seasonalData === "string" ? r.seasonalData : JSON.stringify(r.seasonalData);
          JSON.parse(raw); // validate
          seasonalData = raw;
        }
      } catch { seasonalData = "[]"; }

      let geoSql = "NULL";
      try {
        if (r.geometry) {
          const raw = typeof r.geometry === "string" ? r.geometry : JSON.stringify(r.geometry);
          JSON.parse(raw); // validate
          geoSql = `'${raw.replace(/'/g, "''")}'::jsonb`;
        }
      } catch { geoSql = "NULL"; }

      const q = `
        INSERT INTO districts (
          id, country_id, state_id, name, population,
          vulnerability_score, adaptation_score,
          children_at_risk, elderly_at_risk,
          climate_risks, adaptation_strategies, impact_if_no_action,
          soil_type, rock_type, toilet_technology, water_supply_strategy,
          dropout_rate, water_access_percent, toilet_coverage_percent,
          handwashing_facility_percent,
          school_toilet_percent, school_water_percent,
          anganwadi_toilet_percent, anganwadi_water_percent,
          malnutrition_stunting, malnutrition_wasting, malnutrition_underweight,
          infant_mortality_rate, maternal_mortality_ratio,
          seasonal_data, geometry
        ) VALUES (
          ${pgText(r.id)}, ${pgText(r.stateId)}, ${pgText(r.stateId)}, ${pgText(r.name)}, ${pgNum(r.population)},
          ${pgNum(r.vulnerabilityScore, 50)}, ${pgNum(r.adaptationScore, 30)},
          ${pgNum(r.childrenAtRisk)}, ${pgNum(r.elderlyAtRisk)},
          ${pgArray(climateRisks)}, ${pgArray(adaptationStrategies)}, ${pgText(r.impactIfNoAction ?? "")},
          ${pgText(r.soilType ?? "Alluvial")}, ${pgText(r.rockType ?? "Sandstone")},
          ${pgText(r.toiletTechnology ?? "Twin Pit")}, ${pgText(r.waterSupplyStrategy ?? "Bore Well")},
          ${pgNum(r.dropoutRate)}, ${pgNum(r.waterAccessPercent)}, ${pgNum(r.toiletCoveragePercent)},
          ${pgNum(r.handwashingFacilityPercent)},
          ${r.schoolToiletPercent != null ? pgNum(r.schoolToiletPercent) : "NULL"},
          ${r.schoolWaterPercent != null ? pgNum(r.schoolWaterPercent) : "NULL"},
          ${r.anganwadiToiletPercent != null ? pgNum(r.anganwadiToiletPercent) : "NULL"},
          ${r.anganwadiWaterPercent != null ? pgNum(r.anganwadiWaterPercent) : "NULL"},
          ${pgNum(r.malnutritionStunting)}, ${pgNum(r.malnutritionWasting)}, ${pgNum(r.malnutritionUnderweight)},
          ${pgNum(r.infantMortalityRate)}, ${pgNum(r.maternalMortalityRatio)},
          '${seasonalData.replace(/'/g, "''")}'::jsonb,
          ${geoSql}
        )
        ON CONFLICT (id) DO UPDATE SET
          country_id = EXCLUDED.country_id,
          state_id = EXCLUDED.state_id,
          name = EXCLUDED.name,
          population = EXCLUDED.population,
          vulnerability_score = EXCLUDED.vulnerability_score,
          adaptation_score = EXCLUDED.adaptation_score,
          children_at_risk = EXCLUDED.children_at_risk,
          elderly_at_risk = EXCLUDED.elderly_at_risk,
          climate_risks = EXCLUDED.climate_risks,
          adaptation_strategies = EXCLUDED.adaptation_strategies,
          impact_if_no_action = EXCLUDED.impact_if_no_action,
          soil_type = EXCLUDED.soil_type,
          rock_type = EXCLUDED.rock_type,
          toilet_technology = EXCLUDED.toilet_technology,
          water_supply_strategy = EXCLUDED.water_supply_strategy,
          dropout_rate = EXCLUDED.dropout_rate,
          water_access_percent = EXCLUDED.water_access_percent,
          toilet_coverage_percent = EXCLUDED.toilet_coverage_percent,
          handwashing_facility_percent = EXCLUDED.handwashing_facility_percent,
          school_toilet_percent = EXCLUDED.school_toilet_percent,
          school_water_percent = EXCLUDED.school_water_percent,
          anganwadi_toilet_percent = EXCLUDED.anganwadi_toilet_percent,
          anganwadi_water_percent = EXCLUDED.anganwadi_water_percent,
          malnutrition_stunting = EXCLUDED.malnutrition_stunting,
          malnutrition_wasting = EXCLUDED.malnutrition_wasting,
          malnutrition_underweight = EXCLUDED.malnutrition_underweight,
          infant_mortality_rate = EXCLUDED.infant_mortality_rate,
          maternal_mortality_ratio = EXCLUDED.maternal_mortality_ratio,
          seasonal_data = EXCLUDED.seasonal_data,
          geometry = EXCLUDED.geometry,
          updated_at = NOW();
      `;

      await db.execute(sql.raw(q));
      inserted++;

      if (inserted % 100 === 0) {
        console.log(`[import] ${inserted}/${rows.length} done...`);
      }
    } catch (err: any) {
      console.error(`[import] Failed ${r.id}:`, err.message?.slice(0, 150));
      failed++;
    }
  }

  console.log(`\n[import] Complete: ✓ ${inserted} imported | ✗ ${failed} failed`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
