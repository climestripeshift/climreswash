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
    impactIfNoAction: `Severe impact on ${(childrenPct * 100).toFixed(1)}% child population due to malnutrition and heat stress.`
  };
};
