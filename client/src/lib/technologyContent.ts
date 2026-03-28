export interface TechnologyInfo {
  slug: string;
  title: string;
  category: 'sanitation' | 'water' | 'waste' | 'adaptation';
  description: string;
  climateResilience: string;
  suitableConditions: string[];
  advantages: string[];
  limitations: string[];
  maintenanceLevel: 'Low' | 'Medium' | 'High';
  costLevel: 'Low' | 'Medium' | 'High';
  relatedHazards: string[];
  typology: string[];
}

export const technologyContent: Record<string, TechnologyInfo> = {
  'twin-pit': {
    slug: 'twin-pit',
    title: 'Twin Pit Toilet',
    category: 'sanitation',
    description: 'Twin pit toilets consist of two alternating pits that allow safe decomposition of human waste. When one pit fills up, it is sealed and the other pit is used. After 1-2 years, the sealed pit contents are safely composted and can be removed.',
    climateResilience: 'Moderate resilience to climate extremes. Works well in areas with variable rainfall but may be vulnerable in high water table or flood-prone regions. Requires careful siting in areas with seasonal flooding.',
    suitableConditions: [
      'Areas with stable soil conditions',
      'Regions with low to medium water table',
      'Rural and peri-urban settings',
      'Areas with space for two pits'
    ],
    advantages: [
      'Low cost and simple construction',
      'No water required for operation',
      'Produces safe, reusable compost',
      'Minimal maintenance between pit switches',
      'Long operational life (15-20 years)'
    ],
    limitations: [
      'Not suitable for high water table areas',
      'Requires space for two pits',
      'May require desludging after 10+ years',
      'Vulnerable to flooding if not elevated'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Flood', 'Drought'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly']
  },
  'septic-tank': {
    slug: 'septic-tank',
    title: 'Septic Tank System',
    category: 'sanitation',
    description: 'Septic tanks are underground chambers that treat domestic wastewater through biological decomposition and drainage. They provide primary treatment before effluent is dispersed into a drain field or further treated.',
    climateResilience: 'Good resilience when properly designed. Underground placement protects from temperature extremes. However, requires careful management in flood-prone areas and regular desludging in all conditions.',
    suitableConditions: [
      'Areas with adequate land for drain fields',
      'Regions with permeable soils',
      'Locations with access to desludging services',
      'Urban and peri-urban settings'
    ],
    advantages: [
      'Handles large volumes of wastewater',
      'Underground placement protects from weather',
      'Suitable for multiple households',
      'Well-established technology with clear standards'
    ],
    limitations: [
      'Requires regular desludging (every 3-5 years)',
      'Higher construction cost than pit systems',
      'Needs proper drainage field',
      'Risk of groundwater contamination if poorly designed'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Drought', 'Groundwater Depletion'],
    typology: ['Plains / Alluvial', 'Coastal', 'Rain Intensive']
  },
  'soak-pit': {
    slug: 'soak-pit',
    title: 'Soak Pit / Leach Pit',
    category: 'sanitation',
    description: 'A soak pit is a covered, porous-walled chamber that allows wastewater to slowly seep into surrounding soil. Used primarily for greywater disposal in semi-arid and arid regions with good soil permeability.',
    climateResilience: 'Well-adapted to low-rainfall environments where soil has high permeability. Poor performance in flooded or saturated conditions. Ideal for hot, dry climates with sandy or loamy soils.',
    suitableConditions: [
      'Semi-arid and arid regions',
      'Areas with sandy or loamy permeable soils',
      'Low rainfall and low water table areas',
      'Rural homesteads and small institutions'
    ],
    advantages: [
      'Very low cost and simple to construct',
      'No water supply needed',
      'Effective in dry climates',
      'Easy to build with local materials'
    ],
    limitations: [
      'Not suitable for clay soils or rocky terrain',
      'Fails in high rainfall or flood conditions',
      'Risk of groundwater contamination',
      'Short lifespan in heavy-use settings'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Drought', 'Dust Storm', 'Heatwave'],
    typology: ['Desert / Arid', 'Plains / Alluvial']
  },
  'dewats': {
    slug: 'dewats',
    title: 'DEWATS (Decentralized Wastewater Treatment)',
    category: 'waste',
    description: 'DEWATS is a modular, decentralized approach to wastewater treatment combining settling tanks, anaerobic baffled reactors, anaerobic filters, and constructed wetlands. It treats both black and grey water to safe discharge or reuse standards.',
    climateResilience: 'High resilience due to modular design and natural treatment processes. Constructed wetlands provide buffer against variable flows. Anaerobic processes work efficiently across temperature ranges with minimal energy input.',
    suitableConditions: [
      'Communities of 50-5000 households',
      'Areas without centralized sewerage',
      'Institutions (schools, hospitals, hotels)',
      'Climate-stressed regions needing water reuse'
    ],
    advantages: [
      'No electricity required for operation',
      'Low operating costs after construction',
      'Produces biogas for energy',
      'Treated water can be reused for irrigation',
      'Scalable and modular design'
    ],
    limitations: [
      'Higher initial capital cost',
      'Requires land for constructed wetlands',
      'Needs trained operators for monitoring',
      'Takes 3-6 months to reach full efficiency'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'High',
    relatedHazards: ['Drought', 'Heatwave'],
    typology: ['Plains / Alluvial', 'Rain Intensive', 'Coastal']
  },
  'solid-waste': {
    slug: 'solid-waste',
    title: 'Climate-Resilient Solid Waste Management',
    category: 'waste',
    description: 'Climate-resilient solid waste management integrates waste segregation, composting, recycling, and safe disposal practices designed to withstand climate extremes like heavy rainfall, flooding, and heat stress.',
    climateResilience: 'Resilience depends on infrastructure design. Elevated collection points, covered composting facilities, and flood-proofed landfills are essential in climate-vulnerable areas.',
    suitableConditions: [
      'All settlement types (urban, peri-urban, rural)',
      'Areas with community participation capacity',
      'Regions with market for recyclables',
      'Climate-stressed areas needing decentralized solutions'
    ],
    advantages: [
      'Reduces disease vectors during extreme weather',
      'Creates local employment and recycling markets',
      'Produces compost for agriculture',
      'Reduces methane emissions from landfills',
      'Flexible and scalable approach'
    ],
    limitations: [
      'Requires consistent community engagement',
      'Infrastructure vulnerable to flooding if not elevated',
      'Composting affected by extreme heat or cold',
      'Needs separate handling of hazardous waste'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Heatwave', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Coastal', 'Rain Intensive']
  },
  'rainwater-harvesting': {
    slug: 'rainwater-harvesting',
    title: 'Rainwater Harvesting Systems',
    category: 'water',
    description: 'Rainwater harvesting captures and stores rainfall for drinking, domestic use, or groundwater recharge. Systems range from simple rooftop collection to community-scale storage tanks and recharge wells.',
    climateResilience: 'Highly climate-adaptive technology that converts rainfall variability into a resource. Provides water security during dry periods when designed with adequate storage. Reduces flood risk through managed infiltration.',
    suitableConditions: [
      'Areas with distinct wet and dry seasons',
      'Regions with declining groundwater',
      'Urban areas with rooftop collection potential',
      'Water-stressed rural communities'
    ],
    advantages: [
      'Reduces dependence on groundwater',
      'Low operational cost after installation',
      'Improves water security in drought periods',
      'Recharges local aquifers',
      'Reduces urban flooding'
    ],
    limitations: [
      'Storage capacity limits dry-season supply',
      'Requires roof and catchment maintenance',
      'Quality depends on catchment cleanliness',
      'Initial installation cost can be high'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Drought', 'Groundwater Depletion'],
    typology: ['Rain Intensive', 'Plains / Alluvial', 'Rocky / Hilly']
  },
  'bore-well': {
    slug: 'bore-well',
    title: 'Bore Well with Hand Pump',
    category: 'water',
    description: 'Bore wells access deep groundwater through drilled shafts fitted with hand pumps or motorized pumps. They provide reliable water supply in areas where surface water is scarce or contaminated.',
    climateResilience: 'Reliable during drought and dry spells if groundwater levels are stable. Vulnerable to aquifer depletion in regions with overextraction. Deep bore wells (>100m) are more resilient to seasonal variability.',
    suitableConditions: [
      'Areas with stable deep aquifers',
      'Drought-prone and semi-arid regions',
      'Remote rural communities',
      'Rocky and hard-soil terrain'
    ],
    advantages: [
      'Reliable water source independent of rainfall',
      'Suitable for remote areas',
      'Long lifespan with proper maintenance',
      'Can serve multiple households'
    ],
    limitations: [
      'High drilling cost in hard rock areas',
      'Groundwater depletion risk with overuse',
      'Requires electricity for motorized pumps',
      'Risk of fluoride or arsenic contamination'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Drought', 'Groundwater Depletion', 'Heatwave'],
    typology: ['Desert / Arid', 'Rocky / Hilly', 'Plains / Alluvial']
  },
  'flood-resilient-sanitation': {
    slug: 'flood-resilient-sanitation',
    title: 'Flood-Resilient Elevated Sanitation',
    category: 'sanitation',
    description: 'Elevated or flood-adapted sanitation systems including raised latrines, sealed superstructures, waterproof chambers, and container-based systems designed to remain functional during flood events.',
    climateResilience: 'Specifically engineered for flood resilience. Raised structure prevents inundation of pits and chambers. Sealed design prevents fecal contamination of floodwaters — critical for disease prevention during and after floods.',
    suitableConditions: [
      'Flood plains and river delta regions',
      'Coastal and low-lying areas',
      'Areas with annual monsoon flooding',
      'Communities with cyclone risk'
    ],
    advantages: [
      'Operational during flood events',
      'Prevents fecal-oral disease outbreaks',
      'Protects groundwater quality during floods',
      'Durable against strong currents when anchored'
    ],
    limitations: [
      'Higher construction cost than standard pit',
      'Requires site-specific engineering',
      'Container-based systems need frequent emptying',
      'Community acceptance can be challenging'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'High',
    relatedHazards: ['Flood', 'Cyclone'],
    typology: ['Flood Prone', 'Coastal', 'Rain Intensive']
  },
  'solar-water-pump': {
    slug: 'solar-water-pump',
    title: 'Solar-Powered Water Pump',
    category: 'water',
    description: 'Solar pumps use photovoltaic panels to power water extraction from wells, bore holes, or surface water sources. They provide reliable, off-grid water supply for drinking and irrigation with zero fuel cost after installation.',
    climateResilience: 'Excellent resilience in sunny, arid regions. Not dependent on grid electricity, making them functional during flood-related power outages. High irradiance in desert regions maximizes efficiency. Works best in areas with >4 peak sun hours/day.',
    suitableConditions: [
      'Sunny, arid and semi-arid regions',
      'Off-grid remote communities',
      'Areas with frequent power outages',
      'Irrigation-dependent farming communities'
    ],
    advantages: [
      'Zero fuel cost after installation',
      'Functions during power outages and disasters',
      'Long lifespan (20-25 years for panels)',
      'Low carbon footprint',
      'Scalable from household to community level'
    ],
    limitations: [
      'High upfront capital cost',
      'Performance drops in cloudy/dusty conditions',
      'Requires technical expertise for maintenance',
      'Battery backup needed for night/cloudy use'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'High',
    relatedHazards: ['Drought', 'Heatwave', 'Dust Storm'],
    typology: ['Desert / Arid', 'Plains / Alluvial', 'Rocky / Hilly']
  },
  'watershed-management': {
    slug: 'watershed-management',
    title: 'Watershed Management & Check Dams',
    category: 'adaptation',
    description: 'Watershed management uses a combination of check dams, contour bunding, farm ponds, and vegetation restoration to manage water flow, reduce erosion, and recharge groundwater across a catchment area.',
    climateResilience: 'Highly resilient nature-based solution. Reduces both flood peaks and drought severity by regulating water flow. Effective against soil erosion during heavy rainfall. Improves groundwater recharge for drought resilience.',
    suitableConditions: [
      'Hilly and undulating terrain',
      'Watersheds with degraded vegetation',
      'Rain-shadow and drought-prone regions',
      'Areas with soil erosion problems'
    ],
    advantages: [
      'Addresses both flood and drought simultaneously',
      'Low-cost with high community co-benefit',
      'Improves groundwater recharge',
      'Reduces soil erosion and sedimentation',
      'Enhances local biodiversity'
    ],
    limitations: [
      'Requires community ownership and governance',
      'Benefits accrue over 3-5 year timescale',
      'Needs technical survey for optimal siting',
      'May alter downstream water flows'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Drought', 'Flood', 'Groundwater Depletion'],
    typology: ['Rocky / Hilly', 'Desert / Arid', 'Plains / Alluvial']
  },
  'early-warning-system': {
    slug: 'early-warning-system',
    title: 'Community Early Warning Systems',
    category: 'adaptation',
    description: 'Community-based early warning systems for climate hazards integrate meteorological data, local sensors, community networks, and mobile alerts to provide 24-72 hour advance warning for heatwaves, floods, cyclones, and air quality events.',
    climateResilience: 'Universal climate resilience tool applicable to all hazard types. Shifts response from reactive to proactive, enabling pre-positioning of WASH supplies, evacuation of vulnerable populations, and health system preparedness.',
    suitableConditions: [
      'All climate hazard contexts',
      'Communities with mobile phone penetration',
      'Areas with recurring seasonal hazards',
      'Flood plains, cyclone coasts, and heat-stressed urban areas'
    ],
    advantages: [
      'Works for all hazard types (flood, heat, cyclone)',
      'Reduces mortality and morbidity significantly',
      'Enables pre-positioning of water and hygiene supplies',
      'Empowers community self-protection',
      '10:1 cost-benefit ratio documented by WMO'
    ],
    limitations: [
      'Requires sustained institutional coordination',
      'Effectiveness depends on last-mile communication',
      'Alert fatigue can reduce community response',
      'Needs regular testing and updating'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Heatwave', 'Cyclone', 'Cold Wave', 'Dust Storm', 'Drought'],
    typology: ['Flood Prone', 'Coastal', 'Desert / Arid', 'Plains / Alluvial', 'Rocky / Hilly', 'Rain Intensive']
  },
  'drought-resistant-crops': {
    slug: 'drought-resistant-crops',
    title: 'Drought-Resistant Crops & WASH Integration',
    category: 'adaptation',
    description: 'Integration of drought-tolerant crop varieties with water-efficient WASH practices reduces household water demand during dry spells. Includes drip irrigation for handwashing stations, greywater reuse for kitchen gardens, and nutrition-WASH linkages.',
    climateResilience: 'Directly addresses drought vulnerability by reducing water dependency in food production. Greywater reuse extends scarce water resources. Improves nutrition outcomes which are climate-sensitive indicators for children.',
    suitableConditions: [
      'Drought-prone and semi-arid regions',
      'Agricultural communities',
      'Areas with seasonal water stress',
      'Communities with child malnutrition burden'
    ],
    advantages: [
      'Reduces food and water insecurity simultaneously',
      'Improves child nutrition outcomes',
      'Low-cost greywater reuse',
      'Builds community resilience to climate shocks',
      'Compatible with existing farming practices'
    ],
    limitations: [
      'Requires behavior change and training',
      'Depends on seed availability and extension services',
      'Greywater reuse needs hygiene management',
      'Benefits vary with soil type and agro-climate zone'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Drought', 'Heatwave', 'Groundwater Depletion'],
    typology: ['Desert / Arid', 'Plains / Alluvial', 'Rocky / Hilly']
  }
};

export function getTechnologyBySlug(slug: string): TechnologyInfo | undefined {
  return technologyContent[slug];
}

export function getTechnologiesByCategory(category: 'sanitation' | 'water' | 'waste' | 'adaptation'): TechnologyInfo[] {
  return Object.values(technologyContent).filter(t => t.category === category);
}

export function getAllTechnologies(): TechnologyInfo[] {
  return Object.values(technologyContent);
}

export const ALL_HAZARDS = ['Drought', 'Flood', 'Heatwave', 'Cyclone', 'Cold Wave', 'Dust Storm', 'Groundwater Depletion'] as const;
export const ALL_TYPOLOGIES = ['Desert / Arid', 'Rain Intensive', 'Flood Prone', 'Rocky / Hilly', 'Plains / Alluvial', 'Coastal'] as const;

export const technologyNameToSlug: Record<string, string> = {
  'Twin Pit': 'twin-pit',
  'Twin-Pit': 'twin-pit',
  'twin pit': 'twin-pit',
  'Septic Tank': 'septic-tank',
  'septic tank': 'septic-tank',
  'Soak Pit': 'soak-pit',
  'soak pit': 'soak-pit',
  'DEWATS': 'dewats',
  'Dewats': 'dewats',
  'dewats': 'dewats',
  'Decentralized Wastewater': 'dewats',
  'Solid Waste': 'solid-waste',
  'solid waste': 'solid-waste',
  'Rainwater Harvesting': 'rainwater-harvesting',
  'rainwater harvesting': 'rainwater-harvesting',
  'RWH': 'rainwater-harvesting',
  'Groundwater': 'bore-well',
  'groundwater': 'bore-well',
  'Bore Well': 'bore-well',
  'bore well': 'bore-well',
  'Dual Source': 'rainwater-harvesting',
  'dual source': 'rainwater-harvesting',
  'Solar': 'solar-water-pump',
  'solar': 'solar-water-pump',
  'Watershed': 'watershed-management',
  'watershed': 'watershed-management',
  'Early Warning': 'early-warning-system',
  'early warning': 'early-warning-system',
  'Drought-resistant': 'drought-resistant-crops',
  'drought-resistant': 'drought-resistant-crops',
};

export function getTechnologySlugFromName(name: string): string | null {
  const normalizedName = name?.toLowerCase().trim();
  for (const [key, slug] of Object.entries(technologyNameToSlug)) {
    if (normalizedName?.includes(key.toLowerCase())) {
      return slug;
    }
  }
  return null;
}

export interface TechRecommendation {
  tech: TechnologyInfo;
  reason: string;
  priority: 'High' | 'Medium' | 'Low';
}

export function getRecommendedTechnologies(district: {
  climateRisks?: string[];
  soilType?: string;
  toiletTechnology?: string;
  waterSupplyStrategy?: string;
  waterAccessPercent?: number;
  toiletCoveragePercent?: number;
  vulnerabilityScore?: number;
}): TechRecommendation[] {
  const hazards: string[] = district.climateRisks || [];
  const soil = (district.soilType || '').toLowerCase();
  const waterAccess = district.waterAccessPercent ?? 100;
  const toiletCoverage = district.toiletCoveragePercent ?? 100;
  const vulnScore = district.vulnerabilityScore ?? 0;

  const isFlood = hazards.some(h => h === 'Flood' || h === 'Cyclone');
  const isDrought = hazards.some(h => h === 'Drought');
  const isHeat = hazards.some(h => h === 'Heatwave' || h === 'Dust Storm');
  const isGW = hazards.some(h => h === 'Groundwater Depletion');
  const isArid = soil.includes('sandy') || soil.includes('red') || isDrought;
  const isLowWater = waterAccess < 70;
  const isLowSanitation = toiletCoverage < 70;
  const isHighVuln = vulnScore > 0.5;

  const scored: Array<{ slug: string; reason: string; score: number; priority: 'High' | 'Medium' | 'Low' }> = [];

  const add = (slug: string, reason: string, score: number, priority: 'High' | 'Medium' | 'Low') => {
    if (!scored.find(s => s.slug === slug)) {
      scored.push({ slug, reason, score, priority });
    }
  };

  // SANITATION recommendations
  if (isFlood && isLowSanitation) {
    add('flood-resilient-sanitation', 'Flood risk detected — raised platform toilets prevent faecal contamination of floodwaters and remain operational during inundation.', 10, 'High');
  } else if (isFlood) {
    add('flood-resilient-sanitation', 'Flood/cyclone risk — elevated sealed toilet chambers protect groundwater quality during flood events.', 8, 'High');
  }

  if (isArid && isLowSanitation) {
    add('soak-pit', 'Arid/sandy soil with low sanitation coverage — dry soak-pit latrines require no water and work well in low-rainfall conditions.', 9, 'High');
  }

  if (isLowSanitation && !isFlood) {
    add('twin-pit', 'Low toilet coverage — twin-pit composting toilets need no water, produce safe compost, and are ideal for rural expansion.', 8, 'High');
  }

  if (hazards.some(h => h === 'Heatwave' || h === 'Drought') && !isFlood) {
    add('dewats', 'Water-stressed region — DEWATS treats wastewater for safe reuse, reducing demand on scarce freshwater sources.', 6, 'Medium');
  }

  // WATER recommendations
  if (isLowWater && isDrought) {
    add('solar-water-pump', 'Drought-prone with low water access — solar pumps provide reliable off-grid water supply with zero fuel cost.', 10, 'High');
  }

  if (isLowWater || isGW) {
    add('rainwater-harvesting', isGW
      ? 'Groundwater depletion detected — rainwater harvesting recharges aquifers and provides a surface-water alternative.'
      : 'Low water access — rooftop and community rainwater harvesting improves household water security in dry seasons.',
      9, 'High');
  }

  if (isDrought || isGW) {
    add('bore-well', 'Drought/groundwater stress — deep bore wells access stable aquifers unaffected by surface drought conditions.', 7, 'Medium');
  }

  if (isHeat && isLowWater) {
    add('solar-water-pump', 'Heatwave + water scarcity — solar pumps maximise efficiency in high-irradiance arid regions without grid dependency.', 8, 'High');
  }

  // ADAPTATION recommendations
  if (isHighVuln || hazards.length >= 2) {
    add('early-warning-system', `${hazards.slice(0, 2).join(' + ')} risk — community early warning systems enable pre-positioning of WASH supplies and evacuation of vulnerable groups.`, 8, 'High');
  }

  if (isDrought || isGW) {
    add('watershed-management', 'Drought/groundwater depletion — check dams and watershed restoration regulate water flow, reduce erosion, and recharge aquifers.', 7, 'Medium');
  }

  if (isDrought || isHeat) {
    add('drought-resistant-crops', 'Drought/heat stress — integrating drought-tolerant crops with greywater reuse reduces household water demand and improves child nutrition.', 6, 'Medium');
  }

  // WASTE recommendations
  if (isFlood || hazards.length >= 2) {
    add('solid-waste', 'Multi-hazard district — climate-resilient solid waste management prevents disease vector breeding during flood and heat events.', 5, 'Low');
  }

  // Fallback: match remaining hazard-linked techs not yet added
  for (const tech of Object.values(technologyContent)) {
    if (scored.length >= 8) break;
    const matchesHazard = tech.relatedHazards.some(h => hazards.includes(h));
    if (matchesHazard && !scored.find(s => s.slug === tech.slug)) {
      const matchedHazards = tech.relatedHazards.filter(h => hazards.includes(h));
      add(tech.slug, `Relevant to ${matchedHazards.join(', ')} conditions present in this district.`, 3, 'Low');
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ slug, reason, priority }) => ({
      tech: technologyContent[slug],
      reason,
      priority,
    }))
    .filter(r => r.tech != null);
}
