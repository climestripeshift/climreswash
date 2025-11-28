import { DistrictData } from "./types";

export async function fetchDistricts(): Promise<DistrictData[]> {
  const response = await fetch('/api/districts');
  if (!response.ok) {
    throw new Error('Failed to fetch districts');
  }
  const districts = await response.json();
  
  // Transform backend data to frontend format
  return districts.map((d: any) => ({
    id: d.id,
    name: d.name,
    population: d.population,
    vulnerabilityScore: d.vulnerabilityScore,
    adaptationScore: d.adaptationScore,
    vulnerablePopulation: {
      children: d.childrenAtRisk,
      elderly: d.elderlyAtRisk
    },
    climateRisks: d.climateRisks,
    adaptationStrategies: d.adaptationStrategies,
    impactIfNoAction: d.impactIfNoAction,
    soilType: d.soilType,
    rockType: d.rockType,
    toiletTechnology: d.toiletTechnology,
    waterSupplyStrategy: d.waterSupplyStrategy,
    dropoutRate: d.dropoutRate,
    seasonalData: d.seasonalData
  }));
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
