import { storage } from "./storage";
import { getDistrictData } from "../client/src/lib/mockData";

const districtNames = [
  "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner",
  "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Ganganagar",
  "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur",
  "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur",
  "Sikar", "Sirohi", "Tonk", "Udaipur"
];

async function seedDatabase() {
  console.log("🌱 Seeding database...");

  try {
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
      const existing = await storage.getIntegration(integration.id);
      if (!existing) {
        await storage.createIntegration(integration);
        console.log(`✅ Created integration: ${integration.name}`);
      }
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
        seasonalData: mockData.seasonalData
      };

      const existing = await storage.getDistrict(districtData.id);
      if (!existing) {
        await storage.createDistrict(districtData);
        console.log(`✅ Created district: ${districtName}`);
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
