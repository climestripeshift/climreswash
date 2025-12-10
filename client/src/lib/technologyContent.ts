export interface TechnologyInfo {
  slug: string;
  title: string;
  category: 'sanitation' | 'water' | 'waste';
  description: string;
  climateResilience: string;
  suitableConditions: string[];
  advantages: string[];
  limitations: string[];
  maintenanceLevel: 'Low' | 'Medium' | 'High';
  costLevel: 'Low' | 'Medium' | 'High';
  relatedHazards: string[];
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
    relatedHazards: ['Flood', 'High Rainfall', 'Waterlogging']
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
    relatedHazards: ['Flood', 'Drought', 'Groundwater Contamination']
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
    relatedHazards: ['Drought', 'Water Scarcity', 'Heat Stress']
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
    relatedHazards: ['Flood', 'Heavy Rainfall', 'Heat Wave', 'Vector-borne Disease']
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
    relatedHazards: ['Drought', 'Water Scarcity', 'Groundwater Depletion']
  }
};

export function getTechnologyBySlug(slug: string): TechnologyInfo | undefined {
  return technologyContent[slug];
}

export function getTechnologiesByCategory(category: 'sanitation' | 'water' | 'waste'): TechnologyInfo[] {
  return Object.values(technologyContent).filter(t => t.category === category);
}

export const technologyNameToSlug: Record<string, string> = {
  'Twin Pit': 'twin-pit',
  'Twin-Pit': 'twin-pit',
  'twin pit': 'twin-pit',
  'Septic Tank': 'septic-tank',
  'septic tank': 'septic-tank',
  'DEWATS': 'dewats',
  'Dewats': 'dewats',
  'dewats': 'dewats',
  'Decentralized Wastewater': 'dewats',
  'Solid Waste': 'solid-waste',
  'solid waste': 'solid-waste',
  'Rainwater Harvesting': 'rainwater-harvesting',
  'rainwater harvesting': 'rainwater-harvesting',
  'RWH': 'rainwater-harvesting',
  'Groundwater': 'rainwater-harvesting',
  'groundwater': 'rainwater-harvesting',
  'Dual Source': 'rainwater-harvesting',
  'dual source': 'rainwater-harvesting',
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
