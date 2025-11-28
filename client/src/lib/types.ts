export interface VulnerablePopulation {
  children: number;
  elderly: number;
}

export interface SeasonalImpact {
  month: string;
  hazard: string;
  hazardIntensity: number; // 0-100 scale
  impactMetric: string;
  impactValue: number; // % or scale
  description: string;
}

export interface DistrictData {
  id: string;
  name: string;
  vulnerabilityScore: number;
  adaptationScore: number;
  population: number;
  vulnerablePopulation: VulnerablePopulation;
  climateRisks: string[];
  adaptationStrategies: string[];
  impactIfNoAction: string;
  
  // New Indicators
  soilType: string;
  rockType: string;
  toiletTechnology: string;
  waterSupplyStrategy: string;
  dropoutRate: number; // Percentage
  
  // Seasonality
  seasonalData: SeasonalImpact[];
}

export type MapViewMode = 'vulnerability' | 'adaptation';
