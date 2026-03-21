import { db } from "./db";
import { countries, states, districts, aqiObservations } from "@shared/schema";
import { getAqiCategory } from "./earlyWarning";
import { count } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const climateRisksPool = ["Drought", "Flood", "Heatwave", "Cyclone", "Cold Wave", "Dust Storm", "Groundwater Depletion"];
const adaptationStrategiesPool = ["Rainwater Harvesting", "Solar Energy", "Drought-resistant Crops", "Early Warning Systems", "Watershed Management"];
const soilTypes = ["Sandy", "Alluvial", "Black Cotton", "Red Laterite", "Loamy", "Clay"];
const rockTypes = ["Sandstone", "Granite", "Basalt", "Limestone", "Shale"];
const toiletTypes = ["Septic Tank", "Soak Pit", "Twin Pit", "Single Pit"];
const waterStrategies = ["Bore Well", "Hand Pump", "Piped Water", "Open Well", "Tanker"];

function randomFromArray<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getCategory(score: number): string {
  if (score >= 0.8) return "Very High";
  if (score >= 0.6) return "High";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

function generateSeasonalData(vulnScore: number) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hazards = ["Cold Wave", "None", "Dust Storm", "Heatwave", "Heatwave", "Heatwave", "Flood", "Flood", "Flood", "Cyclone", "None", "Cold Wave"];
  return months.map((month, i) => ({
    month,
    hazard: hazards[i],
    hazardIntensity: Math.round(30 + Math.random() * 60 * vulnScore),
    impactMetric: "Dropout Rate",
    impactValue: Math.round(5 + Math.random() * 15),
    description: hazards[i] === "None" ? "Normal conditions" : `${hazards[i]} risk period`
  }));
}

function generateAqiObservations(districtId: string) {
  const baseAqi = 60 + Math.random() * 80;
  const observations = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const observedAt = new Date(now);
    observedAt.setDate(observedAt.getDate() - i);
    observedAt.setHours(12, 0, 0, 0);
    const aqiValue = Math.max(20, Math.min(400, Math.round(baseAqi + (Math.random() - 0.5) * 30)));
    const aqiInfo = getAqiCategory(aqiValue);
    observations.push({
      id: `aqi-${districtId}-${observedAt.toISOString().split('T')[0]}-${Math.random().toString(36).substring(2, 8)}`,
      districtId,
      aqiValue,
      aqiCategory: aqiInfo.category,
      pm25: Math.round(aqiValue * 0.4 + Math.random() * 20),
      pm10: Math.round(aqiValue * 0.8 + Math.random() * 30),
      no2: Math.round(20 + Math.random() * 40),
      so2: Math.round(10 + Math.random() * 20),
      co: Math.round((1 + Math.random() * 2) * 10) / 10,
      o3: Math.round(30 + Math.random() * 40),
      dominantPollutant: 'PM2.5',
      healthAdvisory: aqiInfo.healthAdvisory,
      observedAt
    });
  }
  return observations;
}

function findGeoJsonPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'dist', 'public', 'data', 'india.json'),
    path.join(cwd, 'client', 'public', 'data', 'india.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function seedIfEmpty(): Promise<void> {
  try {
    const geoJsonPath = findGeoJsonPath();
    if (!geoJsonPath) {
      console.error("[autoSeed] Could not find india.json — cannot seed database.");
      return;
    }

    const geojson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf-8'));
    const features = geojson.features as Array<{ properties: { NAME: string; ID: string; HAZARD?: number; EXPOSURE?: number; VULNERABILITY?: number; RISK?: number; STATE?: string } }>;
    const expectedCount = features.length;

    const result = await db.select({ value: count() }).from(districts);
    const districtCount = result[0]?.value ?? 0;

    if (districtCount >= expectedCount) {
      console.log(`[autoSeed] Database already has ${districtCount}/${expectedCount} districts — skipping seed.`);
      return;
    }

    console.log(`[autoSeed] Database has ${districtCount}/${expectedCount} districts — seeding missing rows from GeoJSON...`);
    console.log(`[autoSeed] Reading GeoJSON from: ${geoJsonPath}`);
    console.log(`[autoSeed] Found ${features.length} districts in GeoJSON`);

    await db.insert(countries).values({
      id: "IND",
      name: "India",
      population: 1400000000,
      totalStates: 36,
      totalDistricts: features.length,
    }).onConflictDoNothing();

    await db.insert(states).values({
      id: "ALL",
      countryId: "IND",
      name: "All States",
      code: "ALL",
      population: 1400000000,
      totalDistricts: features.length,
      topClimateRisks: ["Flood", "Drought", "Heatwave", "Cyclone", "Cold Wave"]
    }).onConflictDoNothing();

    let created = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < features.length; i++) {
      const props = features[i].properties;
      const id = props.ID;
      const name = props.NAME;
      const hazard = props.HAZARD ?? Math.random() * 0.8;
      const exposure = props.EXPOSURE ?? Math.random() * 0.8;
      const vulnerability = props.VULNERABILITY ?? Math.random() * 0.8;
      const risk = props.RISK ?? Math.random() * 0.8;

      const population = Math.round(500000 + Math.random() * 3000000);
      const adaptationScore = Math.round(25 + Math.random() * 50);

      try {
        await db.insert(districts).values({
          id,
          stateId: "ALL",
          name,
          population,
          vulnerabilityScore: vulnerability,
          adaptationScore,
          hazardScore: hazard,
          hazardCategory: getCategory(hazard),
          exposureScore: exposure,
          exposureCategory: getCategory(exposure),
          vulnerabilityCategory: getCategory(vulnerability),
          riskScore: risk,
          riskCategory: getCategory(risk),
          childrenAtRisk: Math.round(population * 0.12 * vulnerability),
          elderlyAtRisk: Math.round(population * 0.08 * vulnerability),
          climateRisks: randomFromArray(climateRisksPool, 3),
          adaptationStrategies: randomFromArray(adaptationStrategiesPool, 2),
          impactIfNoAction: `Risk level: ${getCategory(risk)}. Without intervention, ${name} faces significant climate challenges.`,
          soilType: soilTypes[Math.floor(Math.random() * soilTypes.length)],
          rockType: rockTypes[Math.floor(Math.random() * rockTypes.length)],
          toiletTechnology: toiletTypes[Math.floor(Math.random() * toiletTypes.length)],
          waterSupplyStrategy: waterStrategies[Math.floor(Math.random() * waterStrategies.length)],
          dropoutRate: Math.round(5 + Math.random() * 15),
          waterAccessPercent: Math.round(50 + Math.random() * 45),
          toiletCoveragePercent: Math.round(45 + Math.random() * 50),
          handwashingFacilityPercent: Math.round(30 + Math.random() * 50),
          childMarriageRate: Math.round(5 + Math.random() * 25),
          malnutritionStunting: Math.round(20 + Math.random() * 30),
          malnutritionWasting: Math.round(10 + Math.random() * 20),
          malnutritionUnderweight: Math.round(15 + Math.random() * 25),
          infantMortalityRate: Math.round(20 + Math.random() * 40),
          maternalMortalityRatio: Math.round(80 + Math.random() * 120),
          seasonalData: generateSeasonalData(vulnerability)
        }).onConflictDoNothing();

        const aqiData = generateAqiObservations(id);
        for (const aqi of aqiData) {
          await db.insert(aqiObservations).values(aqi).onConflictDoNothing();
        }

        created++;
      } catch (err) {
        console.warn(`[autoSeed] Skipping district ${name} (${id}):`, err);
      }

      if ((i + 1) % BATCH_SIZE === 0 || i === features.length - 1) {
        console.log(`[autoSeed] ✅ ${i + 1}/${features.length} districts processed`);
      }
    }

    console.log(`[autoSeed] 🎉 Seeding complete! Created ${created} districts.`);
  } catch (error) {
    console.error("[autoSeed] Failed to seed database:", error);
  }
}
