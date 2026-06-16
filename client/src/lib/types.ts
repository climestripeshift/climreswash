export type GeographicLevel = 'country' | 'state' | 'district' | 'block';

export interface CountryData {
  id: string;
  name: string;
  population: number;
  totalStates: number;
  totalDistricts: number;
  avgVulnerabilityScore: number;
  avgAdaptationScore: number;
  totalChildrenAtRisk: number;
  totalElderlyAtRisk: number;
  activeAlerts: number;
  criticalDistricts: number;
  updatedAt: string;
}

export interface StateData {
  id: string;
  countryId: string;
  name: string;
  code: string;
  population: number;
  totalDistricts: number;
  totalBlocks: number;
  avgVulnerabilityScore: number;
  avgAdaptationScore: number;
  totalChildrenAtRisk: number;
  totalElderlyAtRisk: number;
  activeAlerts: number;
  criticalDistricts: number;
  topClimateRisks: string[];
  updatedAt: string;
}

export interface BlockData {
  id: string;
  districtId: string;
  name: string;
  population: number;
  vulnerabilityScore: number;
  adaptationScore: number;
  childrenAtRisk: number;
  elderlyAtRisk: number;
  climateRisks: string[];
  adaptationStrategies: string[];
  waterAccessPercent: number;
  toiletCoveragePercent: number;
  handwashingFacilityPercent: number;
  malnutritionStunting: number;
  infantMortalityRate: number;
  activeAlerts: number;
  gramPanchayats: number;
  villages: number;
  createdAt: string;
  updatedAt: string;
}

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
  stateId?: string;
  countryId?: string;
  id: string;
  name: string;
  vulnerabilityScore: number;
  adaptationScore: number;
  population: number;
  vulnerablePopulation: VulnerablePopulation;
  climateRisks: string[];
  adaptationStrategies: string[];
  impactIfNoAction: string;
  
  // Climate Risk Scores & Categories
  hazardScore?: number | null;
  hazardCategory?: string | null;
  exposureScore?: number | null;
  exposureCategory?: string | null;
  vulnerabilityCategory?: string | null;
  riskScore?: number | null;
  riskCategory?: string | null;
  
  // Infrastructure Indicators
  soilType: string;
  rockType: string;
  toiletTechnology: string;
  waterSupplyStrategy: string;
  dropoutRate: number;
  
  // WASH Indicators — Household
  waterAccessPercent: number;
  toiletCoveragePercent: number;
  handwashingFacilityPercent: number;

  // WASH Indicators — Schools
  schoolToiletPercent?: number | null;
  schoolWaterPercent?: number | null;

  // WASH Indicators — Anganwadis (ICDS)
  anganwadiToiletPercent?: number | null;
  anganwadiWaterPercent?: number | null;
  
  // Health & Social Indicators
  childMarriageRate: number;
  malnutritionStunting: number;
  malnutritionWasting: number;
  malnutritionUnderweight: number;
  infantMortalityRate: number;
  maternalMortalityRatio: number;
  
  // Seasonality
  seasonalData: SeasonalImpact[];

  // Per-hazard intensity (0–1), editable in admin
  hazardIntensities?: Record<string, number> | null;
}

export type MapViewMode = 'vulnerability' | 'adaptation' | 'hazard' | 'exposure' | 'risk' | 'weather' | 'ml-risk';

export interface MlRiskData {
  id: string;
  prediction: { flood: number; heatwave: number; drought: number };
  dominant_hazard: 'flood' | 'heatwave' | 'drought';
  severity: 'low' | 'moderate' | 'high' | 'critical';
}

export interface MlHazardPrediction {
  district_id: string;
  source: string;
  prediction: { flood: number; heatwave: number; drought: number };
  dominant_hazard: 'flood' | 'heatwave' | 'drought';
  triggered_measures: Record<string, {
    probability: number;
    risk_level: { level: string; color: string };
    measures: { action: string; who: string; timeframe: string; priority: string }[];
  }>;
  message: string;
}

export interface MlTechRecommendation {
  district: string;
  proneness_scores: {
    flood_proneness: number;
    heatwave_proneness: number;
    drought_proneness: number;
    dominant_hazard: string;
  };
  recommendations: {
    toilet_recommendations: Array<{
      technology: { name: string; description: string; cost_range: string };
      reason: string;
      priority: string;
    }>;
    liquid_waste_recommendations: Array<{
      technology: { name: string; description: string };
      reason: string;
      priority: string;
    }>;
  };
}

export interface WeatherData {
  id: string;
  name: string;
  temp: number;
  rain: number;
  wind: number;
  humidity: number;
  weatherCode: number;
  condition: string;
  severity: 'normal' | 'watch' | 'warning' | 'emergency';
  fetchedAt: string;
}

export interface Alert {
  id: string;
  districtId: string;
  severity: 'advisory' | 'watch' | 'warning' | 'emergency';
  type: 'heatwave' | 'flood' | 'drought' | 'air_quality' | 'health' | 'dust_storm';
  title: string;
  description: string;
  forecastMonth?: string | null;
  riskScore: number;
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

export interface Intervention {
  id: string;
  alertId: string;
  districtId: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'health' | 'infrastructure' | 'water' | 'shelter' | 'food';
  assignedTo: string | null;
  assignedDepartment: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: string | null;
  completedAt: string | null;
  resourcesRequired: string | null;
  estimatedCost: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityReport {
  id: string;
  districtId: string;
  reportType: 'hazard_sighting' | 'damage_report' | 'resource_need' | 'feedback';
  description: string;
  location: string | null;
  reporterPhone: string | null;
  status: 'pending' | 'verified' | 'addressed';
  severity: 'low' | 'medium' | 'high' | null;
  createdAt: string;
}
