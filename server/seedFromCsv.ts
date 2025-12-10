import { db } from "./db";
import { countries, states, districts, alerts, aqiObservations, interventions, communityReports, blocks, apiIntegrations } from "@shared/schema";
import { generateAlertsForDistrict, getAqiCategory } from "./earlyWarning";
import * as fs from "fs";

interface DistrictRow {
  geometry: string;
  name: string;
  nameCapitalized: string;
  state: string;
  uniqueId: string;
  hazard: number;
  exposure: number;
  vulnerability: number;
  risk: number;
}

function parseCSV(content: string): DistrictRow[] {
  const rows: DistrictRow[] = [];
  const lines = content.split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    let geometry = '';
    let rest = '';
    
    if (line.startsWith('"{')) {
      const endQuoteIdx = line.indexOf('}"') + 2;
      geometry = line.substring(1, endQuoteIdx - 1);
      rest = line.substring(endQuoteIdx + 1);
    } else if (line.startsWith('{')) {
      const match = line.match(/^(\{.*?\}),(.*)$/);
      if (match) {
        geometry = match[1];
        rest = match[2];
      }
    }
    
    if (!rest) continue;
    
    const parts = rest.split(',');
    if (parts.length < 11) continue;
    
    rows.push({
      geometry: geometry.replace(/""/g, '"'),
      name: parts[0]?.trim() || '',
      nameCapitalized: parts[1]?.trim() || '',
      state: parts[2]?.trim() || '',
      uniqueId: parts[3]?.trim() || '',
      hazard: parseFloat(parts[7]) || 0,
      exposure: parseFloat(parts[8]) || 0,
      vulnerability: parseFloat(parts[9]) || 0,
      risk: parseFloat(parts[10]?.replace('\r', '')) || 0
    });
  }
  
  return rows;
}

function getCategory(score: number): string {
  if (score >= 0.8) return "Very High";
  if (score >= 0.6) return "High";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

function generateGeoJSON(rows: DistrictRow[]) {
  const features = rows.map(row => {
    let geometry;
    try {
      geometry = JSON.parse(row.geometry);
    } catch (e) {
      console.error(`Failed to parse geometry for ${row.name}`);
      return null;
    }
    
    return {
      type: "Feature",
      properties: {
        DISTRICT: row.name.toUpperCase(),
        NAME: row.name,
        STATE: row.state,
        ID: row.uniqueId,
        HAZARD: row.hazard,
        EXPOSURE: row.exposure,
        VULNERABILITY: row.vulnerability,
        RISK: row.risk
      },
      geometry
    };
  }).filter(f => f !== null);
  
  return {
    type: "FeatureCollection",
    features
  };
}

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

function generateAqiForDistrict(districtId: string) {
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

async function seedFromCsv() {
  console.log("🌱 Seeding database from CSV...");

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
    
    console.log("📖 Reading CSV file...");
    const csvContent = fs.readFileSync('attached_assets/crisp_country_sheet_1765370671108.csv', 'utf-8');
    const rows = parseCSV(csvContent);
    console.log(`Found ${rows.length} districts in CSV`);
    
    console.log("🗺️ Generating GeoJSON...");
    const geoJson = generateGeoJSON(rows);
    console.log(`Generated GeoJSON with ${geoJson.features.length} features`);
    
    fs.writeFileSync('client/public/data/india.json', JSON.stringify(geoJson));
    console.log("✅ GeoJSON saved to client/public/data/india.json");
    
    console.log("🌍 Creating country...");
    await db.insert(countries).values({
      id: "IND",
      name: "India",
      population: 1400000000,
      totalStates: 36,
      totalDistricts: 735
    });
    
    console.log("🏛️ Creating state placeholder...");
    await db.insert(states).values({
      id: "ALL",
      countryId: "IND",
      name: "All States",
      code: "ALL",
      population: 1400000000,
      totalDistricts: 735,
      topClimateRisks: ["Flood", "Drought", "Heatwave", "Cyclone", "Cold Wave"]
    });
    
    console.log("📊 Creating districts...");
    let createdCount = 0;
    
    for (const row of rows) {
      const hazardCategory = getCategory(row.hazard);
      const exposureCategory = getCategory(row.exposure);
      const vulnerabilityCategory = getCategory(row.vulnerability);
      const riskCategory = getCategory(row.risk);
      
      const population = Math.round(500000 + Math.random() * 3000000);
      const adaptationScore = Math.round(25 + Math.random() * 50);
      
      await db.insert(districts).values({
        id: row.uniqueId,
        stateId: "ALL",
        name: row.name,
        population,
        vulnerabilityScore: row.vulnerability,
        adaptationScore,
        hazardScore: row.hazard,
        hazardCategory,
        exposureScore: row.exposure,
        exposureCategory,
        vulnerabilityCategory,
        riskScore: row.risk,
        riskCategory,
        childrenAtRisk: Math.round(population * 0.12 * row.vulnerability / 10),
        elderlyAtRisk: Math.round(population * 0.08 * row.vulnerability / 10),
        climateRisks: randomFromArray(climateRisksPool, 3),
        adaptationStrategies: randomFromArray(adaptationStrategiesPool, 2),
        impactIfNoAction: `Risk level: ${riskCategory}. Without intervention, ${row.name} faces significant climate challenges.`,
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
        seasonalData: generateSeasonalData(row.vulnerability)
      });
      
      const aqiData = generateAqiForDistrict(row.uniqueId);
      for (const aqi of aqiData) {
        await db.insert(aqiObservations).values(aqi);
      }
      
      createdCount++;
      if (createdCount % 50 === 0) {
        console.log(`   ✅ Created ${createdCount}/${rows.length} districts`);
      }
    }
    
    console.log(`   ✅ Created ${createdCount}/${rows.length} districts`);
    
    const districtCount = rows.length;
    const alertCount = 0;
    
    console.log(`🎉 Database seeded successfully from CSV!`);
    console.log(`   Total districts: ${districtCount}`);
    console.log(`   Total alerts: ${alertCount}`);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

seedFromCsv().then(() => process.exit(0)).catch(() => process.exit(1));
