import { storage } from "./storage";
import type { District, InsertAlert } from "@shared/schema";

type AlertSeverity = 'advisory' | 'watch' | 'warning' | 'emergency';
type AlertType = 'heatwave' | 'flood' | 'drought' | 'air_quality' | 'health' | 'dust_storm';

interface RiskFactors {
  hazardIntensity: number;
  vulnerabilityScore: number;
  healthRisk: number;
  seasonalFactor: number;
}

const SEVERITY_THRESHOLDS = {
  advisory: 60,
  watch: 70,
  warning: 80,
  emergency: 90
};

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCurrentMonth(): string {
  return MONTH_NAMES_SHORT[new Date().getMonth()];
}

function getNextMonths(count: number): string[] {
  const current = new Date().getMonth();
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.push(MONTH_NAMES_SHORT[(current + i) % 12]);
  }
  return months;
}

function calculateHealthRiskScore(district: District): number {
  const imrFactor = Math.min(district.infantMortalityRate / 50, 1) * 100;
  const mmrFactor = Math.min(district.maternalMortalityRatio / 200, 1) * 100;
  const malnutritionFactor = (district.malnutritionStunting + district.malnutritionWasting + district.malnutritionUnderweight) / 3;
  const washDeficit = 100 - ((district.waterAccessPercent + district.toiletCoveragePercent + district.handwashingFacilityPercent) / 3);
  
  return (imrFactor + mmrFactor + malnutritionFactor + washDeficit) / 4;
}

function calculateHealthRiskMultiplier(district: District): number {
  const healthScore = calculateHealthRiskScore(district);
  return 1 + (healthScore / 100);
}

function getSeasonalHazards(district: District, months: string[]): { hazard: string; intensity: number; description: string }[] {
  const hazards: { hazard: string; intensity: number; description: string }[] = [];
  
  if (!district.seasonalData || !Array.isArray(district.seasonalData)) return hazards;
  
  for (const month of months) {
    const monthData = district.seasonalData.find((s: any) => s.month === month);
    if (monthData && monthData.hazard !== 'None' && monthData.hazardIntensity >= 30) {
      hazards.push({
        hazard: monthData.hazard,
        intensity: monthData.hazardIntensity,
        description: monthData.description
      });
    }
  }
  
  return hazards;
}

function calculateCompositeRisk(factors: RiskFactors): number {
  const weights = {
    hazardIntensity: 0.35,
    vulnerabilityScore: 0.25,
    healthRisk: 0.25,
    seasonalFactor: 0.15
  };
  
  return (
    factors.hazardIntensity * weights.hazardIntensity +
    factors.vulnerabilityScore * weights.vulnerabilityScore +
    factors.healthRisk * weights.healthRisk +
    factors.seasonalFactor * weights.seasonalFactor
  );
}

function determineSeverity(riskScore: number): AlertSeverity {
  if (riskScore >= SEVERITY_THRESHOLDS.emergency) return 'emergency';
  if (riskScore >= SEVERITY_THRESHOLDS.warning) return 'warning';
  if (riskScore >= SEVERITY_THRESHOLDS.watch) return 'watch';
  if (riskScore >= SEVERITY_THRESHOLDS.advisory) return 'advisory';
  return 'advisory';
}

function mapHazardToType(hazard: string): AlertType {
  const hazardMap: Record<string, AlertType> = {
    'Extreme Heat': 'heatwave',
    'Heatwave': 'heatwave',
    'Heat Stress': 'heatwave',
    'Flooding': 'flood',
    'Flash Floods': 'flood',
    'Monsoon Flooding': 'flood',
    'Agricultural Drought': 'drought',
    'Drought': 'drought',
    'Water Scarcity': 'drought',
    'Groundwater Depletion': 'drought',
    'Dust Storms': 'dust_storm',
    'Sand Storms': 'dust_storm',
    'Winter Pollution': 'air_quality',
    'Air Quality': 'air_quality'
  };
  return hazardMap[hazard] || 'health';
}

function getRecommendedActions(type: AlertType, severity: AlertSeverity): string[] {
  const baseActions: Record<AlertType, string[]> = {
    heatwave: [
      'Avoid outdoor activities during peak heat hours (12-4 PM)',
      'Increase fluid intake and stay hydrated',
      'Check on elderly and vulnerable family members',
      'Use cooling centers and shaded areas'
    ],
    flood: [
      'Move to higher ground if in flood-prone areas',
      'Prepare emergency kit with essentials',
      'Avoid crossing flooded roads or bridges',
      'Stay updated with local authorities\' announcements'
    ],
    drought: [
      'Conserve water and avoid non-essential usage',
      'Report any water wastage to local authorities',
      'Check on livestock water availability',
      'Implement rainwater harvesting where possible'
    ],
    air_quality: [
      'Limit outdoor activities especially for children and elderly',
      'Wear N95 masks when outdoors',
      'Keep windows closed and use air purifiers',
      'Seek medical help if experiencing breathing difficulties'
    ],
    dust_storm: [
      'Stay indoors during dust storm events',
      'Cover nose and mouth with wet cloth if outdoors',
      'Protect eyes and avoid wearing contact lenses',
      'Secure loose items and close all windows'
    ],
    health: [
      'Ensure access to safe drinking water',
      'Practice proper hand hygiene',
      'Monitor children for signs of malnutrition',
      'Seek immediate medical attention for severe symptoms'
    ]
  };

  const additionalEmergency = [
    'Contact local emergency services if needed',
    'Follow evacuation orders from authorities',
    'Keep emergency contacts readily available'
  ];

  if (severity === 'emergency' || severity === 'warning') {
    return [...baseActions[type], ...additionalEmergency];
  }
  return baseActions[type];
}

function calculateImpactedPopulation(district: District, severity: AlertSeverity): number {
  const vulnerableBase = district.childrenAtRisk + district.elderlyAtRisk;
  const severityMultiplier: Record<AlertSeverity, number> = {
    advisory: 0.1,
    watch: 0.25,
    warning: 0.5,
    emergency: 0.75
  };
  return Math.round(vulnerableBase * severityMultiplier[severity]);
}

function generateProjectedImpact(type: AlertType, severity: AlertSeverity, district: District): string {
  const impacts: Record<AlertType, string[]> = {
    heatwave: [
      'Increased heat-related illnesses and dehydration cases',
      'Strain on healthcare facilities',
      'Agricultural productivity losses',
      'Higher electricity demand for cooling'
    ],
    flood: [
      'Property damage and displacement of families',
      'Contamination of drinking water sources',
      'Road and infrastructure damage',
      'Increased waterborne disease risk'
    ],
    drought: [
      'Crop failure and agricultural losses',
      'Groundwater depletion',
      'Drinking water scarcity',
      'Livestock mortality and migration'
    ],
    air_quality: [
      'Respiratory illness surge',
      'Increased hospital admissions',
      'School closures for vulnerable children',
      'Long-term health impacts on vulnerable groups'
    ],
    dust_storm: [
      'Visibility reduction affecting transport',
      'Respiratory problems from dust inhalation',
      'Damage to crops and property',
      'Power outages from dust accumulation'
    ],
    health: [
      'Increased disease outbreaks',
      'Strain on healthcare systems',
      'Higher mortality in vulnerable populations',
      'Economic losses from reduced productivity'
    ]
  };

  const baseImpacts = impacts[type].slice(0, severity === 'emergency' ? 4 : 2);
  const populationNote = `Approximately ${calculateImpactedPopulation(district, severity).toLocaleString()} vulnerable individuals at risk.`;
  
  return baseImpacts.join('. ') + '. ' + populationNote;
}

export async function generateAlertsForDistrict(district: District): Promise<InsertAlert[]> {
  const alerts: InsertAlert[] = [];
  const upcomingMonths = getNextMonths(3);
  const seasonalHazards = getSeasonalHazards(district, upcomingMonths);
  const healthRiskScore = calculateHealthRiskScore(district);
  
  const bestHazards = new Map<string, { hazard: string; intensity: number; description: string }>();
  for (const hazardData of seasonalHazards) {
    const existing = bestHazards.get(hazardData.hazard);
    if (!existing || hazardData.intensity > existing.intensity) {
      bestHazards.set(hazardData.hazard, hazardData);
    }
  }

  for (const hazardData of Array.from(bestHazards.values())) {
    const riskFactors: RiskFactors = {
      hazardIntensity: hazardData.intensity,
      vulnerabilityScore: district.vulnerabilityScore,
      healthRisk: healthRiskScore,
      seasonalFactor: 100 - district.adaptationScore
    };

    const compositeRisk = calculateCompositeRisk(riskFactors);
    
    if (compositeRisk >= SEVERITY_THRESHOLDS.advisory) {
      const severity = determineSeverity(compositeRisk);
      const type = mapHazardToType(hazardData.hazard);
      
      const now = new Date();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7);

      const alertId = `alert-${district.id}-${type}-${hazardData.hazard.replace(/\s+/g, '-').toLowerCase()}`;
      const alert: InsertAlert = {
        id: alertId,
        districtId: district.id,
        severity,
        type,
        title: `${hazardData.hazard} ${severity.charAt(0).toUpperCase() + severity.slice(1)} for ${district.name}`,
        description: hazardData.description,
        impactedPopulation: calculateImpactedPopulation(district, severity),
        recommendedActions: getRecommendedActions(type, severity),
        drivers: [
          `Hazard intensity: ${hazardData.intensity.toFixed(0)}%`,
          `Vulnerability score: ${district.vulnerabilityScore}`,
          `Health risk: ${healthRiskScore.toFixed(0)}/100`,
          `Adaptation deficit: ${(100 - district.adaptationScore).toFixed(0)}%`
        ],
        projectedImpact: generateProjectedImpact(type, severity, district),
        validFrom: now,
        validUntil,
        isActive: 1
      };

      alerts.push(alert);
    }
  }

  return alerts;
}

export async function recomputeAllAlerts(): Promise<InsertAlert[]> {
  const districts = await storage.getAllDistricts();
  const allAlerts: InsertAlert[] = [];

  for (const district of districts) {
    const districtAlerts = await generateAlertsForDistrict(district);
    for (const alert of districtAlerts) {
      await storage.createAlert(alert);
      allAlerts.push(alert);
    }
  }

  return allAlerts;
}

export function getAqiCategory(aqi: number): { category: string; color: string; healthAdvisory: string; riskMultiplier: number } {
  if (aqi <= 50) return { 
    category: 'Good', 
    color: '#00e400', 
    healthAdvisory: 'Air quality is satisfactory, no health impacts expected.',
    riskMultiplier: 1.0
  };
  if (aqi <= 100) return { 
    category: 'Satisfactory', 
    color: '#ffff00', 
    healthAdvisory: 'Minor breathing discomfort for sensitive people.',
    riskMultiplier: 1.1
  };
  if (aqi <= 200) return { 
    category: 'Moderate', 
    color: '#ff7e00', 
    healthAdvisory: 'Breathing discomfort for people with asthma, heart disease.',
    riskMultiplier: 1.3
  };
  if (aqi <= 300) return { 
    category: 'Poor', 
    color: '#ff0000', 
    healthAdvisory: 'Breathing discomfort for most people on prolonged exposure.',
    riskMultiplier: 1.5
  };
  if (aqi <= 400) return { 
    category: 'Very Poor', 
    color: '#8f3f97', 
    healthAdvisory: 'Respiratory illness on prolonged exposure. Avoid outdoor activity.',
    riskMultiplier: 1.8
  };
  return { 
    category: 'Severe', 
    color: '#7e0023', 
    healthAdvisory: 'Health impacts even with short exposure. Stay indoors.',
    riskMultiplier: 2.0
  };
}
