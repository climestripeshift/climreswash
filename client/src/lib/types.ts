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
