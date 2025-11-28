import { storage } from "./storage";
import { getDistrictData } from "../client/src/lib/mockData";
import { db } from "./db";
import { districts, apiIntegrations, alerts, aqiObservations } from "@shared/schema";
import { generateAlertsForDistrict, getAqiCategory } from "./earlyWarning";

const districtNames = [
  "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner",
  "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Ganganagar",
  "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur",
  "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur",
  "Sikar", "Sirohi", "Tonk", "Udaipur"
];

// AQI base values by region type (desert districts have higher PM10 due to dust)
const desertDistricts = ["Jaisalmer", "Barmer", "Bikaner", "Jodhpur", "Jalore", "Churu", "Nagaur", "Ganganagar"];
const industrialDistricts = ["Jaipur", "Kota", "Jodhpur", "Ajmer", "Udaipur", "Bhilwara"];

function generateAqiForDistrict(districtId: string, districtName: string) {
  const isDesert = desertDistricts.includes(districtName);
  const isIndustrial = industrialDistricts.includes(districtName);
  
  // Base AQI varies by region type
  let baseAqi = 80 + Math.random() * 40;
  if (isDesert) baseAqi += 50; // Higher due to dust
  if (isIndustrial) baseAqi += 30; // Higher due to emissions
  
  // November is generally high pollution season in India
  const currentMonth = new Date().getMonth();
  if (currentMonth >= 9 && currentMonth <= 1) {
    baseAqi += 40; // Winter pollution season
  }
  
  const observations = [];
  const now = new Date();
  
  // Generate 7 days of historical data
  for (let i = 6; i >= 0; i--) {
    const observedAt = new Date(now);
    observedAt.setDate(observedAt.getDate() - i);
    observedAt.setHours(12, 0, 0, 0);
    
    // Add daily variation
    const dailyVariation = (Math.random() - 0.5) * 30;
    const aqiValue = Math.max(20, Math.min(400, Math.round(baseAqi + dailyVariation)));
    
    const aqiInfo = getAqiCategory(aqiValue);
    
    // Calculate pollutant values based on AQI
    const pm25 = Math.round(aqiValue * 0.4 + Math.random() * 20);
    const pm10 = Math.round(aqiValue * 0.8 + (isDesert ? 50 : 0) + Math.random() * 30);
    const no2 = Math.round(20 + Math.random() * 40 + (isIndustrial ? 20 : 0));
    const so2 = Math.round(10 + Math.random() * 20 + (isIndustrial ? 15 : 0));
    const co = Math.round((1 + Math.random() * 2) * 10) / 10;
    const o3 = Math.round(30 + Math.random() * 40);
    
    // Determine dominant pollutant
    let dominantPollutant = 'PM2.5';
    if (pm10 > pm25 * 1.5) dominantPollutant = 'PM10';
    if (isDesert) dominantPollutant = 'PM10';
    
    observations.push({
      id: `aqi-${districtId}-${observedAt.toISOString().split('T')[0]}`,
      districtId,
      aqiValue,
      aqiCategory: aqiInfo.category,
      pm25,
      pm10,
      no2,
      so2,
      co,
      o3,
      dominantPollutant,
      healthAdvisory: aqiInfo.healthAdvisory,
      respiratoryRiskMultiplier: aqiInfo.riskMultiplier,
      source: 'CPCB',
      observedAt
    });
  }
  
  return observations;
}

async function seedDatabase() {
  console.log("🌱 Seeding database...");

  try {
    // Clear existing data
    console.log("🗑️ Clearing existing data...");
    await db.delete(alerts);
    await db.delete(aqiObservations);
    await db.delete(districts);
    await db.delete(apiIntegrations);
    
    // Seed API integrations
    const integrations = [
      {
        id: "imd-weather",
        name: "IMD Weather API",
        type: "imd",
        isConnected: 0,
        lastSync: null,
        endpoint: "https://api.imd.gov.in",
        metadata: {}
      },
      {
        id: "cgwb-groundwater",
        name: "CGWB Groundwater",
        type: "groundwater",
        isConnected: 1,
        lastSync: new Date(),
        endpoint: "https://api.cgwb.gov.in",
        metadata: {}
      }
    ];

    for (const integration of integrations) {
      await storage.createIntegration(integration);
      console.log(`✅ Created integration: ${integration.name}`);
    }

    // Seed districts
    for (const districtName of districtNames) {
      const mockData = getDistrictData(districtName);
      
      const districtData = {
        id: `IND-ADM2-${districtName.toUpperCase()}`,
        name: mockData.name,
        population: mockData.population,
        vulnerabilityScore: mockData.vulnerabilityScore,
        adaptationScore: mockData.adaptationScore,
        childrenAtRisk: mockData.vulnerablePopulation.children,
        elderlyAtRisk: mockData.vulnerablePopulation.elderly,
        climateRisks: mockData.climateRisks,
        adaptationStrategies: mockData.adaptationStrategies,
        impactIfNoAction: mockData.impactIfNoAction,
        soilType: mockData.soilType,
        rockType: mockData.rockType,
        toiletTechnology: mockData.toiletTechnology,
        waterSupplyStrategy: mockData.waterSupplyStrategy,
        dropoutRate: mockData.dropoutRate,
        waterAccessPercent: mockData.waterAccessPercent,
        toiletCoveragePercent: mockData.toiletCoveragePercent,
        handwashingFacilityPercent: mockData.handwashingFacilityPercent,
        childMarriageRate: mockData.childMarriageRate,
        malnutritionStunting: mockData.malnutritionStunting,
        malnutritionWasting: mockData.malnutritionWasting,
        malnutritionUnderweight: mockData.malnutritionUnderweight,
        infantMortalityRate: mockData.infantMortalityRate,
        maternalMortalityRatio: mockData.maternalMortalityRatio,
        seasonalData: mockData.seasonalData
      };

      const createdDistrict = await storage.createDistrict(districtData);
      console.log(`✅ Created district: ${districtName}`);

      // Generate alerts for this district
      const districtAlerts = await generateAlertsForDistrict(createdDistrict);
      for (const alert of districtAlerts) {
        await storage.createAlert(alert);
      }
      if (districtAlerts.length > 0) {
        console.log(`   ⚠️ Created ${districtAlerts.length} alerts`);
      }

      // Generate AQI data for this district
      const aqiData = generateAqiForDistrict(createdDistrict.id, districtName);
      for (const aqi of aqiData) {
        await storage.createAqiObservation(aqi);
      }
      console.log(`   🌬️ Created ${aqiData.length} AQI observations`);
    }

    console.log("🎉 Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();
