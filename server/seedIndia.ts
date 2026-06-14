import { storage } from "./storage";
import { db } from "./db";
import { countries, states, districts, blocks, apiIntegrations, alerts, aqiObservations, interventions, communityReports } from "@shared/schema";
import { generateAlertsForDistrict, getAqiCategory } from "./earlyWarning";
import * as fs from "fs";

const climateRisksPool = [
  "Drought", "Flood", "Heatwave", "Cyclone", "Cold Wave", "Dust Storm",
  "Groundwater Depletion", "Sea Level Rise", "Urban Heat Island", "Landslide",
  "Forest Fire", "Flash Flood", "Water Scarcity", "Soil Degradation"
];

const adaptationStrategiesPool = [
  "Rainwater Harvesting", "Solar Energy Transition", "Drought-resistant Crops",
  "Early Warning Systems", "Watershed Management", "Urban Green Spaces",
  "Flood Control Infrastructure", "Climate-resilient Agriculture", "Mangrove Restoration",
  "Groundwater Recharge", "Heat Action Plans", "Climate-smart Irrigation"
];

const soilTypes = ["Sandy", "Alluvial", "Black Cotton", "Red Laterite", "Loamy", "Clay"];
const rockTypes = ["Sandstone", "Granite", "Basalt", "Limestone", "Shale", "Quartzite"];
const toiletTypes = ["Septic Tank", "Soak Pit", "Twin Pit", "Single Pit", "Biogas"];
const waterStrategies = ["Bore Well", "Hand Pump", "Piped Water", "Open Well", "Tanker", "Surface Water"];

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hazardsByMonth = [
  { month: "Jan", hazard: "Cold Wave", intensity: 60 },
  { month: "Feb", hazard: "None", intensity: 20 },
  { month: "Mar", hazard: "Dust Storm", intensity: 40 },
  { month: "Apr", hazard: "Heatwave", intensity: 70 },
  { month: "May", hazard: "Heatwave", intensity: 90 },
  { month: "Jun", hazard: "Heatwave", intensity: 85 },
  { month: "Jul", hazard: "Flood", intensity: 60 },
  { month: "Aug", hazard: "Flood", intensity: 70 },
  { month: "Sep", hazard: "Flood", intensity: 50 },
  { month: "Oct", hazard: "Cyclone", intensity: 40 },
  { month: "Nov", hazard: "None", intensity: 20 },
  { month: "Dec", hazard: "Cold Wave", intensity: 50 }
];

function randomFromArray<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateSeasonalData(vulnerabilityScore: number) {
  return hazardsByMonth.map(h => ({
    month: h.month,
    hazard: h.hazard,
    hazardIntensity: Math.round(h.intensity * (0.8 + Math.random() * 0.4)),
    impactMetric: "Dropout Rate",
    impactValue: Math.round(5 + Math.random() * 15),
    description: h.hazard === "None" ? "Normal conditions" : `${h.hazard} risk period`
  }));
}

/** Convert state name to a stable slug used as the DB primary key. */
function stateSlug(stateName: string): string {
  return stateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Build district data from GeoJSON properties + seeded WASH/health fields.
 * hazardScore, exposureScore, vulnerabilityScore come from the GeoJSON so the
 * map choropleth reflects real relative risk values rather than random numbers.
 */
function generateDistrictData(
  name: string,
  id: string,
  stateId: string,
  geoHazard: number,
  geoExposure: number,
  geoVulnerability: number,
) {
  // Scale GeoJSON [0,1] scores to [0,100] for the DB columns
  const hazardScore    = Math.round(geoHazard       * 100);
  const exposureScore  = Math.round(geoExposure      * 100);
  const vulnerabilityScore = Math.round(geoVulnerability * 100);

  const adaptationScore = Math.round(20 + Math.random() * 50);
  const population = Math.round(500000 + Math.random() * 3000000);

  return {
    id,
    name,
    stateId,
    countryId: "IND",
    population,
    hazardScore,
    exposureScore,
    vulnerabilityScore,
    adaptationScore,
    childrenAtRisk: Math.round(population * 0.05 * (vulnerabilityScore / 100)),
    elderlyAtRisk: Math.round(population * 0.03 * (vulnerabilityScore / 100)),
    climateRisks: randomFromArray(climateRisksPool, 3 + Math.floor(Math.random() * 2)),
    adaptationStrategies: randomFromArray(adaptationStrategiesPool, 2 + Math.floor(Math.random() * 3)),
    impactIfNoAction: `Without intervention, ${name} could see ${Math.round(20 + Math.random() * 30)}% crop yield reduction and ${Math.round(10 + Math.random() * 20)}% increase in climate-related health issues by 2030.`,
    soilType: soilTypes[Math.floor(Math.random() * soilTypes.length)],
    rockType: rockTypes[Math.floor(Math.random() * rockTypes.length)],
    toiletTechnology: toiletTypes[Math.floor(Math.random() * toiletTypes.length)],
    waterSupplyStrategy: waterStrategies[Math.floor(Math.random() * waterStrategies.length)],
    dropoutRate: Math.round(5 + Math.random() * 15),
    waterAccessPercent: Math.round(50 + Math.random() * 45),
    toiletCoveragePercent: Math.round(40 + Math.random() * 55),
    handwashingFacilityPercent: Math.round(30 + Math.random() * 50),
    childMarriageRate: Math.round(5 + Math.random() * 30),
    malnutritionStunting: Math.round(20 + Math.random() * 30),
    malnutritionWasting: Math.round(10 + Math.random() * 20),
    malnutritionUnderweight: Math.round(15 + Math.random() * 25),
    infantMortalityRate: Math.round(25 + Math.random() * 35),
    maternalMortalityRatio: Math.round(80 + Math.random() * 120),
    seasonalData: generateSeasonalData(vulnerabilityScore)
  };
}

function generateAqiForDistrict(districtId: string) {
  const baseAqi = 60 + Math.random() * 80;
  const observations = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const observedAt = new Date(now);
    observedAt.setDate(observedAt.getDate() - i);
    observedAt.setHours(12, 0, 0, 0);
    
    const dailyVariation = (Math.random() - 0.5) * 30;
    const aqiValue = Math.max(20, Math.min(400, Math.round(baseAqi + dailyVariation)));
    const aqiInfo = getAqiCategory(aqiValue);
    
    const pm25 = Math.round(aqiValue * 0.4 + Math.random() * 20);
    const pm10 = Math.round(aqiValue * 0.8 + Math.random() * 30);
    const no2 = Math.round(20 + Math.random() * 40);
    const so2 = Math.round(10 + Math.random() * 20);
    const co = Math.round((1 + Math.random() * 2) * 10) / 10;
    const o3 = Math.round(30 + Math.random() * 40);
    
    observations.push({
      id: `aqi-${districtId}-${observedAt.toISOString().split('T')[0]}`,
      districtId,
      aqiValue,
      aqiCategory: aqiInfo.category,
      pm25, pm10, no2, so2, co, o3,
      dominantPollutant: pm25 > pm10 / 2 ? 'PM2.5' : 'PM10',
      healthAdvisory: aqiInfo.healthAdvisory,
      observedAt
    });
  }
  
  return observations;
}

async function seedIndiaDatabase() {
  console.log("🌱 Seeding India database...");

  try {
    console.log("🗑️ Clearing existing data...");
    await db.delete(interventions);
    await db.delete(communityReports);
    await db.delete(alerts);
    await db.delete(aqiObservations);
    await db.delete(blocks);
    await db.delete(districts);
    await db.delete(states);
    await db.delete(countries);
    await db.delete(apiIntegrations);
    
    console.log("📖 Reading GeoJSON...");
    const geojsonContent = fs.readFileSync('client/public/data/india.json', 'utf-8');
    const geojson = JSON.parse(geojsonContent);
    
    const districtFeatures = geojson.features;
    console.log(`Found ${districtFeatures.length} districts`);

    console.log("🌍 Creating country...");
    await storage.createCountry({
      id: "IND",
      name: "India",
      population: 1400000000,
      totalStates: 28,
      totalDistricts: districtFeatures.length,
      avgVulnerabilityScore: 55,
      avgAdaptationScore: 40,
      totalChildrenAtRisk: 50000000,
      totalElderlyAtRisk: 35000000,
      activeAlerts: 0,
      criticalDistricts: 0
    });

    // ── Group features by state so we can create one state record each ─────────
    const byState = new Map<string, typeof districtFeatures>();
    for (const f of districtFeatures) {
      const sName: string = f.properties.STATE || "Unknown";
      if (!byState.has(sName)) byState.set(sName, []);
      byState.get(sName)!.push(f);
    }

    console.log(`🏛️ Creating ${byState.size} state records...`);
    // Approximate populations per state (Census 2011, millions → scaled)
    const STATE_POP: Record<string, number> = {
      "Uttar Pradesh": 200000000, "Maharashtra": 112000000, "Bihar": 104000000,
      "West Bengal": 91000000, "Madhya Pradesh": 72000000, "Rajasthan": 69000000,
      "Tamil Nadu": 72000000, "Karnataka": 61000000, "Gujarat": 60000000,
      "Andhra Pradesh": 50000000, "Telangana": 35000000, "Odisha": 42000000,
      "Jharkhand": 33000000, "Kerala": 33000000, "Assam": 31000000,
      "Punjab": 28000000, "Chhattisgarh": 26000000, "Haryana": 25000000,
      "Uttarakhand": 10000000, "Himachal Pradesh": 7000000, "Jammu And Kashmir": 12000000,
      "Ladakh": 300000, "Delhi": 16700000, "Goa": 1500000, "Tripura": 3700000,
      "Meghalaya": 3000000, "Manipur": 2800000, "Nagaland": 1980000,
      "Mizoram": 1100000, "Sikkim": 610000, "Arunachal Pradesh": 1380000,
      "Chandigarh": 1050000, "Puducherry": 1250000, "Lakshadweep": 64000,
      "Andaman And Nicobar Islands": 380000,
      "Dadra & Nagar Haveli And Daman & Diu": 590000,
    };

    for (const [stateName, features] of Array.from(byState.entries())) {
      const sid = stateSlug(stateName);
      const avgVuln = Math.round(features.reduce((s: number, f: any) => s + (f.properties.VULNERABILITY || 0.5), 0) / features.length * 100);
      const pop = STATE_POP[stateName] ?? Math.round(features.length * 800000);
      await storage.createState({
        id: sid,
        countryId: "IND",
        name: stateName,
        code: sid.toUpperCase().slice(0, 6),
        population: pop,
        totalDistricts: features.length,
        totalBlocks: 0,
        avgVulnerabilityScore: avgVuln,
        avgAdaptationScore: 40,
        totalChildrenAtRisk: Math.round(pop * 0.05 * (avgVuln / 100)),
        totalElderlyAtRisk: Math.round(pop * 0.03 * (avgVuln / 100)),
        activeAlerts: 0,
        criticalDistricts: 0,
        topClimateRisks: ["Drought", "Flood", "Heatwave", "Cyclone", "Cold Wave"],
      });
    }

    let totalAlerts = 0;
    let criticalDistricts = 0;
    let sumVulnerability = 0;
    let sumAdaptation = 0;
    let sumChildren = 0;
    let sumElderly = 0;

    console.log("📊 Creating districts with real GeoJSON risk scores...");

    for (let i = 0; i < districtFeatures.length; i++) {
      const feature = districtFeatures[i];
      const name    = feature.properties.NAME;
      const id      = feature.properties.ID;
      const stateName: string = feature.properties.STATE || "Unknown";
      const sid     = stateSlug(stateName);

      const geoHazard       = Number(feature.properties.HAZARD)        || 0.25;
      const geoExposure     = Number(feature.properties.EXPOSURE)       || 0.35;
      const geoVulnerability = Number(feature.properties.VULNERABILITY) || 0.40;

      const districtData = generateDistrictData(name, id, sid, geoHazard, geoExposure, geoVulnerability);

      const createdDistrict = await storage.createDistrict(districtData);
      
      if (districtData.vulnerabilityScore >= 70) criticalDistricts++;
      sumVulnerability += districtData.vulnerabilityScore;
      sumAdaptation += districtData.adaptationScore;
      sumChildren += districtData.childrenAtRisk;
      sumElderly += districtData.elderlyAtRisk;

      const districtAlerts = await generateAlertsForDistrict(createdDistrict);
      for (const alert of districtAlerts) {
        await storage.createAlert(alert);
      }
      totalAlerts += districtAlerts.length;

      const aqiData = generateAqiForDistrict(id);
      for (const aqi of aqiData) {
        await storage.createAqiObservation(aqi);
      }

      if ((i + 1) % 50 === 0 || i === districtFeatures.length - 1) {
        console.log(`   ✅ Created ${i + 1}/${districtFeatures.length} districts`);
      }
    }

    await storage.updateState("ALL", {
      activeAlerts: totalAlerts,
      criticalDistricts,
      avgVulnerabilityScore: Math.round(sumVulnerability / districtFeatures.length),
      avgAdaptationScore: Math.round(sumAdaptation / districtFeatures.length),
      totalChildrenAtRisk: sumChildren,
      totalElderlyAtRisk: sumElderly
    });

    await storage.updateCountry("IND", {
      activeAlerts: totalAlerts,
      criticalDistricts,
      avgVulnerabilityScore: Math.round(sumVulnerability / districtFeatures.length),
      avgAdaptationScore: Math.round(sumAdaptation / districtFeatures.length),
      totalChildrenAtRisk: sumChildren,
      totalElderlyAtRisk: sumElderly
    });

    console.log("🎉 India database seeded successfully!");
    console.log(`   Total districts: ${districtFeatures.length}`);
    console.log(`   Total alerts: ${totalAlerts}`);
    console.log(`   Critical districts: ${criticalDistricts}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedIndiaDatabase();
