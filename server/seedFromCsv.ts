import { db } from "./db";
import { countries, states, districts, alerts, aqiObservations, interventions, communityReports, blocks, apiIntegrations } from "@shared/schema";
import { generateAlertsForDistrict, getAqiCategory } from "./earlyWarning";
import * as fs from "fs";

interface DistrictRow {
  geometry: string;
  name: string;
  nameCapitalized: string;
  uniqueId: string;
  shapeLength: number;
  shapeArea: number;
  hazardScore: number;
  hazardCategory: string;
  exposureScore: number;
  exposureCategory: string;
  vulnerabilityScore: number;
  vulnerabilityCategory: string;
  riskScore: number;
  riskCategory: string;
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
    if (parts.length < 14) continue;
    
    rows.push({
      geometry: geometry.replace(/""/g, '"'),
      name: parts[0]?.trim() || '',
      nameCapitalized: parts[1]?.trim() || '',
      uniqueId: parts[2]?.trim() || '',
      shapeLength: parseFloat(parts[3]) || 0,
      shapeArea: parseFloat(parts[4]) || 0,
      hazardScore: parseFloat(parts[6]) || 0,
      hazardCategory: parts[7]?.trim() || 'Low',
      exposureScore: parseFloat(parts[8]) || 0,
      exposureCategory: parts[9]?.trim() || 'Low',
      vulnerabilityScore: parseFloat(parts[10]) || 0,
      vulnerabilityCategory: parts[11]?.trim() || 'Low',
      riskScore: parseFloat(parts[12]) || 0,
      riskCategory: parts[13]?.trim().replace('\r', '') || 'Low'
    });
  }
  
  return rows;
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
        DISTRICT: row.nameCapitalized,
        NAME: row.name,
        ID: row.uniqueId,
        HAZARD_SCORE: row.hazardScore,
        HAZARD_CATEGORY: row.hazardCategory,
        EXPOSURE_SCORE: row.exposureScore,
        EXPOSURE_CATEGORY: row.exposureCategory,
        VULNERABILITY_SCORE: row.vulnerabilityScore,
        VULNERABILITY_CATEGORY: row.vulnerabilityCategory,
        RISK_SCORE: row.riskScore,
        RISK_CATEGORY: row.riskCategory
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
    hazardIntensity: Math.round(30 + Math.random() * 60 * (vulnScore / 100)),
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
    const csvContent = fs.readFileSync('attached_assets/data_sheet_-_Sheet3_1765365535049.csv', 'utf-8');
    const rows = parseCSV(csvContent);
    console.log(`Found ${rows.length} districts in CSV`);
    
    console.log("🗺️ Generating GeoJSON...");
    const geojson = generateGeoJSON(rows);
    fs.writeFileSync('client/public/data/india.json', JSON.stringify(geojson));
    console.log(`Generated GeoJSON with ${geojson.features.length} features`);

    console.log("🌍 Creating country...");
    await db.insert(countries).values({
      id: "IND",
      name: "India",
      population: 1400000000,
      totalStates: 28,
      totalDistricts: rows.length,
      avgVulnerabilityScore: 0,
      avgAdaptationScore: 0,
      totalChildrenAtRisk: 0,
      totalElderlyAtRisk: 0,
      activeAlerts: 0,
      criticalDistricts: 0
    });

    console.log("🏛️ Creating state placeholder...");
    await db.insert(states).values({
      id: "ALL",
      countryId: "IND",
      name: "All States",
      code: "ALL",
      population: 1400000000,
      totalDistricts: rows.length,
      totalBlocks: 0,
      avgVulnerabilityScore: 0,
      avgAdaptationScore: 0,
      totalChildrenAtRisk: 0,
      totalElderlyAtRisk: 0,
      activeAlerts: 0,
      criticalDistricts: 0,
      topClimateRisks: ["Drought", "Flood", "Heatwave", "Cyclone", "Cold Wave"]
    });

    let totalAlerts = 0;
    let criticalCount = 0;
    let sumVuln = 0;
    let sumRisk = 0;

    console.log("📊 Creating districts...");
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const population = Math.round(500000 + Math.random() * 3000000);
      const vulnScore = row.vulnerabilityScore || Math.round(30 + Math.random() * 60);
      const adaptScore = Math.round(20 + Math.random() * 50);
      
      const districtData = {
        id: row.uniqueId,
        stateId: "ALL",
        name: row.name,
        population,
        vulnerabilityScore: vulnScore,
        adaptationScore: adaptScore,
        hazardScore: row.hazardScore,
        hazardCategory: row.hazardCategory,
        exposureScore: row.exposureScore,
        exposureCategory: row.exposureCategory,
        vulnerabilityCategory: row.vulnerabilityCategory,
        riskScore: row.riskScore,
        riskCategory: row.riskCategory,
        childrenAtRisk: Math.round(population * 0.05 * (vulnScore / 100)),
        elderlyAtRisk: Math.round(population * 0.03 * (vulnScore / 100)),
        climateRisks: randomFromArray(climateRisksPool, 3),
        adaptationStrategies: randomFromArray(adaptationStrategiesPool, 2),
        impactIfNoAction: `Risk level: ${row.riskCategory}. Without intervention, ${row.name} faces significant climate challenges.`,
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
        seasonalData: generateSeasonalData(vulnScore)
      };
      
      const [createdDistrict] = await db.insert(districts).values(districtData).returning();
      
      if (row.riskCategory === 'Very High' || row.riskCategory === 'High') {
        criticalCount++;
      }
      sumVuln += vulnScore;
      sumRisk += row.riskScore || 0;

      const districtAlerts = await generateAlertsForDistrict(createdDistrict);
      for (const alert of districtAlerts) {
        await db.insert(alerts).values(alert);
      }
      totalAlerts += districtAlerts.length;

      const aqiData = generateAqiForDistrict(row.uniqueId);
      for (const aqi of aqiData) {
        await db.insert(aqiObservations).values(aqi);
      }

      if ((i + 1) % 50 === 0 || i === rows.length - 1) {
        console.log(`   ✅ Created ${i + 1}/${rows.length} districts`);
      }
    }

    await db.update(states).set({
      activeAlerts: totalAlerts,
      criticalDistricts: criticalCount,
      avgVulnerabilityScore: Math.round(sumVuln / rows.length)
    });

    await db.update(countries).set({
      activeAlerts: totalAlerts,
      criticalDistricts: criticalCount,
      avgVulnerabilityScore: Math.round(sumVuln / rows.length)
    });

    console.log("🎉 Database seeded successfully from CSV!");
    console.log(`   Total districts: ${rows.length}`);
    console.log(`   Total alerts: ${totalAlerts}`);
    console.log(`   Critical districts: ${criticalCount}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedFromCsv();
