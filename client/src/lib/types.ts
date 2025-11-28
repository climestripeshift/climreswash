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

export interface Alert {
  id: string;
  districtId: string;
  severity: 'advisory' | 'watch' | 'warning' | 'emergency';
  type: 'heatwave' | 'flood' | 'drought' | 'air_quality' | 'health' | 'dust_storm';
  title: string;
  description: string;
  impactedPopulation: number;
  recommendedActions: string[];
  drivers: string[];
  projectedImpact: string;
  validFrom: string;
  validUntil: string;
  isActive: number;
  createdAt: string;
}

export interface AqiObservation {
  id: string;
  districtId: string;
  aqiValue: number;
  aqiCategory: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  o3: number | null;
  dominantPollutant: string | null;
  healthAdvisory: string | null;
  respiratoryRiskMultiplier: number;
  source: string;
  observedAt: string;
  createdAt: string;
}
