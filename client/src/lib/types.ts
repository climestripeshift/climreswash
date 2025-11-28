export interface VulnerablePopulation {
  children: number;
  elderly: number;
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
}

export type MapViewMode = 'vulnerability' | 'adaptation';
