import { DistrictData } from "./types";

// Helper to generate consistent pseudo-random numbers from a string seed
const simpleHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const risks = ["Extreme Heat", "Drought", "Flash Floods", "Groundwater Depletion", "Crop Failure"];
const strategies = [
  "Rainwater Harvesting", 
  "Drip Irrigation", 
  "Heat-Resistant Crops", 
  "Community Water Storage", 
  "Early Warning Systems", 
  "Solar Pumps"
];

export const getDistrictData = (districtName: string): DistrictData => {
  const hash = simpleHash(districtName);
  const vulnerabilityScore = (hash % 60) + 40; // 40-100 range
  const adaptationScore = 100 - (hash % 50) - 20; // 30-80 range
  
  const population = (hash % 500000) + 200000;
  const childrenPct = 0.25 + ((hash % 10) / 100);
  const elderlyPct = 0.15 + ((hash % 10) / 100);
  
  // Pick random risks based on hash
  const districtRisks = risks.filter((_, i) => (hash >> i) & 1);
  if (districtRisks.length === 0) districtRisks.push(risks[0]);
  
  // Pick random strategies
  const districtStrategies = strategies.filter((_, i) => (hash >> (i+2)) & 1);
  if (districtStrategies.length === 0) districtStrategies.push(strategies[0]);

  // New Mock Data Generators
  const soilTypes = ["Sandy Desert Soil", "Loamy Sand", "Clay Loam", "Alluvial Soil", "Red Yellow Soil"];
  const rockTypes = ["Sandstone", "Limestone", "Granite", "Gneiss", "Schist"];
  const toiletTechs = ["Twin Pit System", "Septic Tank with Soak Pit", "Bio-digester", "Eco-san Dehydration", "Leach Pit"];
  const waterStrategies = ["Piped Water Supply (JJM)", "Community Solar Pump", "Rainwater Harvesting Tank", "Traditional Stepwell Revamp", "Canal Distribution"];

  const soilType = soilTypes[hash % soilTypes.length];
  const rockType = rockTypes[(hash >> 1) % rockTypes.length];
  const toiletTechnology = toiletTechs[(hash >> 2) % toiletTechs.length];
  const waterSupplyStrategy = waterStrategies[(hash >> 3) % waterStrategies.length];
  
  const baseDropout = 2 + (hash % 15); // 2-17% base dropout
  
  // Generate Seasonality
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const seasonalData = months.map((month, i) => {
    let hazard = "None";
    let intensity = 20 + (Math.random() * 20);
    let impactVal = baseDropout;
    let desc = "Normal conditions";

    // Summer / Heatwave (Apr-Jun)
    if (i >= 3 && i <= 5) {
      hazard = "Heatwave";
      intensity = 70 + (hash % 30); // High intensity
      impactVal = baseDropout + (intensity * 0.15); // Dropout increases with heat
      desc = "High temperatures limit school attendance and increase water fetching burden.";
    }
    // Monsoon / Floods (Jul-Sep)
    else if (i >= 6 && i <= 8) {
      hazard = "Flash Flood";
      intensity = 40 + (hash % 50);
      impactVal = baseDropout + (intensity * 0.05); // Moderate impact
      desc = "Waterlogging disrupts transport to schools.";
    }
    // Winter (Dec-Jan)
    else if (i === 11 || i === 0) {
      hazard = "Cold Wave";
      intensity = 30 + (hash % 40);
      impactVal = baseDropout;
      desc = "Mild disruption due to cold.";
    }

    return {
      month,
      hazard,
      hazardIntensity: Math.round(intensity),
      impactMetric: "Dropout Rate",
      impactValue: Number(impactVal.toFixed(1)),
      description: desc
    };
  });

  return {
    id: districtName,
    name: districtName,
    vulnerabilityScore,
    adaptationScore,
    population,
    vulnerablePopulation: {
      children: Math.round(population * childrenPct),
      elderly: Math.round(population * elderlyPct),
    },
    climateRisks: districtRisks,
    adaptationStrategies: districtStrategies,
    impactIfNoAction: `Severe impact on ${(childrenPct * 100).toFixed(1)}% child population due to malnutrition and heat stress.`,
    
    // New Fields
    soilType,
    rockType,
    toiletTechnology,
    waterSupplyStrategy,
    dropoutRate: Number(baseDropout.toFixed(1)),
    seasonalData
  };
};
