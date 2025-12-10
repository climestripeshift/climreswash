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

function generateDistrictData(name: string, id: string) {
  const vulnerabilityScore = Math.round(30 + Math.random() * 60);
  const adaptationScore = Math.round(20 + Math.random() * 50);
  const population = Math.round(500000 + Math.random() * 3000000);
  
  return {
    id,
    name,
    population,
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
    const geojsonContent = fs.readFileSync('public/data/india.json', 'utf-8');
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

    console.log("🏛️ Creating state (India-wide placeholder)...");
    await storage.createState({
      id: "ALL",
      countryId: "IND",
      name: "All States",
      code: "ALL",
      population: 1400000000,
      totalDistricts: districtFeatures.length,
      totalBlocks: 0,
      avgVulnerabilityScore: 55,
      avgAdaptationScore: 40,
      totalChildrenAtRisk: 50000000,
      totalElderlyAtRisk: 35000000,
      activeAlerts: 0,
      criticalDistricts: 0,
      topClimateRisks: ["Drought", "Flood", "Heatwave", "Cyclone", "Cold Wave"]
    });

    let totalAlerts = 0;
    let criticalDistricts = 0;
    let sumVulnerability = 0;
    let sumAdaptation = 0;
    let sumChildren = 0;
    let sumElderly = 0;

    console.log("📊 Creating districts...");
    
    for (let i = 0; i < districtFeatures.length; i++) {
      const feature = districtFeatures[i];
      const name = feature.properties.NAME;
      const id = feature.properties.ID;
      
      const districtData = generateDistrictData(name, id);
      
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
