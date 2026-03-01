import type { DistrictData } from './types';

export interface FundingEstimate {
  mitigationFunding: number;
  adaptationFunding: number;
  totalFunding: number;
}

export function estimateDistrictFunding(district: DistrictData): FundingEstimate {
  const population = district.population ?? 100000;

  const hazard = district.hazardScore ?? 0.5;
  const risk = district.riskScore ?? 0.5;
  const vulnerability = district.vulnerabilityScore ?? 50;
  const vulnNormalized = vulnerability / 100;
  const adaptationGap = 1 - Math.min((district.adaptationScore ?? 50) / 100, 1);

  const washDeficit = (
    (100 - (district.waterAccessPercent ?? 70)) +
    (100 - (district.toiletCoveragePercent ?? 60)) +
    (100 - (district.handwashingFacilityPercent ?? 50))
  ) / 300;

  const healthBurden = Math.min(
    ((district.infantMortalityRate ?? 30) / 100) * 0.4 +
    ((district.malnutritionStunting ?? 30) / 100) * 0.3 +
    ((district.malnutritionWasting ?? 15) / 100) * 0.3,
    1
  );

  const mitigationPerCapita = 800 + (hazard * 1200) + (risk * 1000);
  const mitigationFunding = Math.round(population * mitigationPerCapita);

  const adaptationPerCapita = 600 + (vulnNormalized * 1400) + (adaptationGap * 1200) + (washDeficit * 800) + (healthBurden * 600);
  const adaptationFunding = Math.round(population * adaptationPerCapita);

  return {
    mitigationFunding,
    adaptationFunding,
    totalFunding: mitigationFunding + adaptationFunding,
  };
}

export function aggregateFunding(districts: DistrictData[]): FundingEstimate {
  let mitigationFunding = 0;
  let adaptationFunding = 0;

  for (const d of districts) {
    const est = estimateDistrictFunding(d);
    mitigationFunding += est.mitigationFunding;
    adaptationFunding += est.adaptationFunding;
  }

  return {
    mitigationFunding,
    adaptationFunding,
    totalFunding: mitigationFunding + adaptationFunding,
  };
}

export function formatIndianCurrency(amount: number): string {
  const crore = 10000000;
  const lakh = 100000;

  if (amount >= crore) {
    const value = amount / crore;
    return `₹${value >= 100 ? Math.round(value).toLocaleString('en-IN') : value.toFixed(1)} Cr`;
  }
  if (amount >= lakh) {
    const value = amount / lakh;
    return `₹${value.toFixed(1)} L`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
