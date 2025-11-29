import { storage } from "./storage";
import { getDistrictData } from "../client/src/lib/mockData";
import { db } from "./db";
import { districts, apiIntegrations, alerts, aqiObservations, interventions, communityReports } from "@shared/schema";
import { generateAlertsForDistrict, getAqiCategory } from "./earlyWarning";
import type { InsertIntervention, InsertCommunityReport } from "@shared/schema";

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

const interventionTemplates: Record<string, { title: string; description: string; category: string }[]> = {
  heatwave: [
    { title: "Deploy cooling centers", description: "Set up temporary cooling stations with water and shade in affected areas", category: "shelter" },
    { title: "Distribute ORS packets", description: "Provide oral rehydration supplies to vulnerable households", category: "health" },
    { title: "Deploy medical teams", description: "Station emergency medical responders in high-risk areas", category: "health" }
  ],
  flood: [
    { title: "Evacuate low-lying areas", description: "Coordinate evacuation of families from flood-prone zones", category: "shelter" },
    { title: "Distribute emergency food kits", description: "Provide 7-day emergency food supplies to affected families", category: "food" },
    { title: "Deploy water purification", description: "Set up temporary water treatment facilities", category: "water" }
  ],
  drought: [
    { title: "Deploy water tankers", description: "Provide emergency water supply to affected villages", category: "water" },
    { title: "Fodder distribution", description: "Distribute fodder for livestock in drought-affected areas", category: "food" },
    { title: "Monitor groundwater", description: "Assess groundwater levels and implement extraction limits", category: "infrastructure" }
  ],
  health: [
    { title: "Mobile health camps", description: "Organize health screening camps in affected areas", category: "health" },
    { title: "Vaccination drive", description: "Conduct emergency vaccination for waterborne diseases", category: "health" },
    { title: "Nutrition support", description: "Distribute nutrition supplements to children and pregnant women", category: "health" }
  ],
  air_quality: [
    { title: "Distribute N95 masks", description: "Provide protective masks to vulnerable population", category: "health" },
    { title: "School advisory", description: "Issue advisories for school closures during severe AQI", category: "health" },
    { title: "Respiratory care units", description: "Set up respiratory treatment facilities", category: "health" }
  ],
  dust_storm: [
    { title: "Issue travel advisory", description: "Warn against unnecessary travel during dust storms", category: "infrastructure" },
    { title: "Emergency shelter", description: "Open public buildings as emergency shelters", category: "shelter" },
    { title: "Power grid protection", description: "Secure power infrastructure from dust damage", category: "infrastructure" }
  ]
};

const departments = ["Health Department", "Water Resources", "Revenue Department", "District Administration", "PWD", "Agriculture Department"];
const statuses: Array<'pending' | 'in_progress' | 'completed'> = ['pending', 'in_progress', 'completed'];
const priorities: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low'];

function generateInterventionsForAlert(alertId: string, districtId: string, alertType: string): InsertIntervention[] {
  const templates = interventionTemplates[alertType] || interventionTemplates.health;
  const numInterventions = Math.min(templates.length, 1 + Math.floor(Math.random() * 2));
  
  return templates.slice(0, numInterventions).map((template, idx) => ({
    id: `int-${alertId}-${idx}`,
    alertId,
    districtId,
    title: template.title,
    description: template.description,
    priority: priorities[Math.floor(Math.random() * 3)],
    category: template.category,
    assignedTo: `Officer ${Math.floor(Math.random() * 100)}`,
    assignedDepartment: departments[Math.floor(Math.random() * departments.length)],
    status: statuses[Math.floor(Math.random() * 3)],
    dueDate: new Date(Date.now() + Math.random() * 14 * 24 * 60 * 60 * 1000),
    estimatedCost: Math.round((10000 + Math.random() * 500000) * 100) / 100,
    resourcesRequired: "Personnel, vehicles, supplies as needed"
  }));
}

const reportTypes = ['hazard_sighting', 'damage_report', 'resource_need', 'feedback'];
const reportTemplates = [
  { type: 'hazard_sighting', description: 'Observed flooding near the village well', severity: 'high' },
  { type: 'damage_report', description: 'Roof damage to 3 houses due to strong winds', severity: 'medium' },
  { type: 'resource_need', description: 'Need drinking water supply urgently', severity: 'high' },
  { type: 'feedback', description: 'Water tanker arrived late but was helpful', severity: 'low' },
  { type: 'hazard_sighting', description: 'Dust storm approaching from the west', severity: 'high' },
  { type: 'damage_report', description: 'Crops affected by unexpected heatwave', severity: 'medium' }
];

function generateCommunityReports(districtId: string): InsertCommunityReport[] {
  const numReports = 1 + Math.floor(Math.random() * 3);
  const reports: InsertCommunityReport[] = [];
  
  for (let i = 0; i < numReports; i++) {
    const template = reportTemplates[Math.floor(Math.random() * reportTemplates.length)];
    reports.push({
      id: `report-${districtId}-${Date.now()}-${i}`,
      districtId,
      reportType: template.type as any,
      description: template.description,
      location: `Village ${Math.floor(Math.random() * 100)}`,
      reporterPhone: `+91 ${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
      status: ['pending', 'verified', 'addressed'][Math.floor(Math.random() * 3)] as any,
      severity: template.severity as any
    });
  }
  
  return reports;
}

async function seedDatabase() {
  console.log("🌱 Seeding database...");

  try {
    // Clear existing data
    console.log("🗑️ Clearing existing data...");
    await db.delete(interventions);
    await db.delete(communityReports);
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
        
        // Create sample interventions for each alert
        const interventionData = generateInterventionsForAlert(alert.id, createdDistrict.id, alert.type);
        for (const intervention of interventionData) {
          await storage.createIntervention(intervention);
        }
      }
      if (districtAlerts.length > 0) {
        console.log(`   ⚠️ Created ${districtAlerts.length} alerts with interventions`);
      }

      // Generate AQI data for this district
      const aqiData = generateAqiForDistrict(createdDistrict.id, districtName);
      for (const aqi of aqiData) {
        await storage.createAqiObservation(aqi);
      }
      console.log(`   🌬️ Created ${aqiData.length} AQI observations`);

      // Generate sample community reports for some districts
      if (Math.random() > 0.6) {
        const reports = generateCommunityReports(createdDistrict.id);
        for (const report of reports) {
          await storage.createCommunityReport(report);
        }
        console.log(`   📱 Created ${reports.length} community reports`);
      }
    }

    console.log("🎉 Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();
