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
  
  // Infrastructure Indicators
  soilType: string;
  rockType: string;
  toiletTechnology: string;
  waterSupplyStrategy: string;
  dropoutRate: number;
  
  // WASH Indicators
  waterAccessPercent: number;
  toiletCoveragePercent: number;
  handwashingFacilityPercent: number;
  
  // Health & Social Indicators
  childMarriageRate: number;
  malnutritionStunting: number;
  malnutritionWasting: number;
  malnutritionUnderweight: number;
  infantMortalityRate: number;
  maternalMortalityRatio: number;
  
  // Seasonality
  seasonalData: SeasonalImpact[];
}

export type MapViewMode = 'vulnerability' | 'adaptation';
