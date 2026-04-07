import { DistrictData } from "./types";

export function transformDistrict(d: any): DistrictData {
  return {
    id: d.id,
    name: d.name,
    population: d.population,
    countryId: d.countryId,
    stateId: d.stateId,
    vulnerabilityScore: d.vulnerabilityScore,
    adaptationScore: d.adaptationScore,
    vulnerablePopulation: {
      children: d.childrenAtRisk ?? 0,
      elderly: d.elderlyAtRisk ?? 0,
    },
    climateRisks: d.climateRisks ?? [],
    adaptationStrategies: d.adaptationStrategies ?? [],
    impactIfNoAction: d.impactIfNoAction ?? "",
    hazardScore: d.hazardScore,
    hazardCategory: d.hazardCategory,
    exposureScore: d.exposureScore,
    exposureCategory: d.exposureCategory,
    vulnerabilityCategory: d.vulnerabilityCategory,
    riskScore: d.riskScore,
    riskCategory: d.riskCategory,
    soilType: d.soilType,
    rockType: d.rockType,
    toiletTechnology: d.toiletTechnology,
    waterSupplyStrategy: d.waterSupplyStrategy,
    dropoutRate: d.dropoutRate ?? 0,
    waterAccessPercent: d.waterAccessPercent ?? 0,
    toiletCoveragePercent: d.toiletCoveragePercent ?? 0,
    handwashingFacilityPercent: d.handwashingFacilityPercent ?? 0,
    childMarriageRate: d.childMarriageRate,
    malnutritionStunting: d.malnutritionStunting,
    malnutritionWasting: d.malnutritionWasting,
    malnutritionUnderweight: d.malnutritionUnderweight,
    infantMortalityRate: d.infantMortalityRate ?? 0,
    maternalMortalityRatio: d.maternalMortalityRatio ?? 0,
    seasonalData: d.seasonalData ?? [],
  };
}

export async function fetchDistricts(): Promise<DistrictData[]> {
  const response = await fetch('/api/districts');
  if (!response.ok) {
    throw new Error('Failed to fetch districts');
  }
  const districts = await response.json();
  return districts.map(transformDistrict);
}

export async function fetchDistrict(id: string | number): Promise<DistrictData> {
  const response = await fetch(`/api/districts/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch district');
  }
  const d = await response.json();
  return transformDistrict(d);
}

export async function deleteDistrict(id: string): Promise<void> {
  const response = await fetch(`/api/districts/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete district');
  }
}

export async function fetchIntegrations() {
  const response = await fetch('/api/integrations');
  if (!response.ok) {
    throw new Error('Failed to fetch integrations');
  }
  return response.json();
}

export async function updateIntegration(id: string, data: any) {
  const response = await fetch(`/api/integrations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('Failed to update integration');
  }
  return response.json();
}
