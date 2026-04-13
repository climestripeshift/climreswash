export type HazardSuitability = 'recommended' | 'conditional' | 'not_suitable';

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
  // Climate-hazard suitability from the WASH Technology Climate Matrix
  hazardSuitability?: Record<string, HazardSuitability>;
  // Context note from the matrix (typology / setting)
  matrixContext?: string;
  matrixCategory?: string;
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
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly'],
    matrixCategory: 'Pit-based',
    matrixContext: 'Flood-prone & seasonally waterlogged areas; pits raised 0.6–1 m; alternating pit design',
    hazardSuitability: {
      'Flood': 'recommended',
      'Flash Flood': 'conditional',
      'Drought': 'conditional',
      'Cyclone': 'conditional',
      'Heatwave': 'recommended',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'recommended',
      'Coastal Flooding': 'conditional',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'conditional',
      'Rocky Terrain': 'not_suitable',
    },
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
    typology: ['Plains / Alluvial', 'Coastal', 'Rain Intensive'],
    matrixCategory: 'Septic',
    matrixContext: 'Low water table areas; semi-urban; requires periodic desludging',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'conditional',
      'Cyclone': 'conditional',
      'Heatwave': 'conditional',
      'Cold Wave': 'conditional',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'not_suitable',
      'Urban Dense': 'recommended',
    },
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
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'recommended',
      'Cyclone': 'conditional',
      'Heatwave': 'conditional',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'not_suitable',
    },
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
    typology: ['Flood Prone', 'Coastal', 'Rain Intensive'],
    matrixCategory: 'Flood-specific',
    matrixContext: 'Perennial flood zones / riverine communities; anchored floating structure; elevated pit design',
    hazardSuitability: {
      'Flood': 'recommended',
      'Flash Flood': 'recommended',
      'Drought': 'not_suitable',
      'Cyclone': 'not_suitable',
      'Heatwave': 'not_suitable',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'recommended',
      'Coastal Flooding': 'recommended',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'not_suitable',
    },
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
  },

  // ── New technologies from Toilet Technology Climate Matrix ──────────────

  'vip': {
    slug: 'vip',
    title: 'Ventilated Improved Pit (VIP)',
    category: 'sanitation',
    description: 'A ventilated improved pit latrine uses a vertical pipe attached to the pit to create airflow that reduces odour and controls flies. A fly screen over the vent pipe traps flies inside. Best suited for hot, humid climates.',
    climateResilience: 'Good performance in hot/humid climates where natural ventilation is effective. Not suited for flood-prone or cold areas. Functions well in drought conditions due to minimal water use.',
    suitableConditions: [
      'Hot and humid climatic zones',
      'Rural and peri-urban settings',
      'Areas with low water availability',
      'Communities transitioning from open defecation'
    ],
    advantages: [
      'Significantly reduces odour and flies vs standard pit',
      'No water needed for operation',
      'Low construction cost',
      'Durable in hot, dry conditions'
    ],
    limitations: [
      'Not suitable for flood or waterlogging zones',
      'Vent pipe requires regular inspection',
      'Fly screen needs maintenance',
      'Limited climate hazard resilience'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave', 'Drought'],
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    matrixCategory: 'Pit-based',
    matrixContext: 'Hot/humid climates; ventilation pipe reduces flies & odour',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'conditional',
      'Cyclone': 'conditional',
      'Heatwave': 'recommended',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'not_suitable',
    },
  },

  'bio-digester': {
    slug: 'bio-digester',
    title: 'Bio-Digester Toilet',
    category: 'sanitation',
    description: 'Bio-digester toilets use anaerobic digestion by cold-active bacteria (DRDO design) to break down human waste. Widely adopted in cold climates and plains across India — initially for the army, now scaled for civilian use.',
    climateResilience: 'Excellent performance in cold climates where other technologies fail. Anaerobic bacteria remain active near 0°C. Underground installation provides thermal insulation. Minimal water consumption and no sludge removal needed.',
    suitableConditions: [
      'Cold climates and high-altitude areas',
      'Plains with space for underground tank',
      'Areas without sewer connectivity',
      'Institutions (schools, barracks, anganwadis)'
    ],
    advantages: [
      'Effective at near-freezing temperatures',
      'Produces effluent safe for irrigation or discharge',
      'No pit emptying required for 25+ years',
      'Low water consumption',
      'DRDO-certified and widely proven in India'
    ],
    limitations: [
      'Initial cost higher than simple pit systems',
      'Requires careful installation',
      'Cold-climate design may over-perform in hot areas',
      'Needs adequate water supply for flush'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Cold Wave', 'Drought'],
    typology: ['Rocky / Hilly', 'Plains / Alluvial'],
    matrixCategory: 'Anaerobic',
    matrixContext: 'Cold climates, plains; DRDO anaerobic digestion; suitable near frost conditions',
    hazardSuitability: {
      'Flood': 'conditional',
      'Flash Flood': 'not_suitable',
      'Drought': 'conditional',
      'Cyclone': 'conditional',
      'Heatwave': 'conditional',
      'Cold Wave': 'recommended',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'conditional',
      'Post-Disaster': 'conditional',
      'Rocky Terrain': 'not_suitable',
    },
  },

  'constructed-wetland': {
    slug: 'constructed-wetland',
    title: 'Constructed Wetland (CW)',
    category: 'waste',
    description: 'Constructed wetlands are engineered systems that mimic natural wetland processes using aquatic plants (reeds, bulrush) to treat wastewater. They require no chemicals or energy and provide habitat co-benefits.',
    climateResilience: 'Nature-based solution with high climate co-benefits. Especially suited to waterlogged and coastal zones. Provides flood buffering while treating wastewater. Plant cover provides cooling in heat. Not suited to drought-prone areas.',
    suitableConditions: [
      'Wetland and coastal zones',
      'Areas with adequate land',
      'Communities seeking nature-based solutions',
      'Schools and institutions with space'
    ],
    advantages: [
      'No energy or chemical inputs required',
      'High biodiversity and ecological co-benefits',
      'Effective for BOD, TSS, and nutrient removal',
      'Long lifespan with minimal maintenance',
      'Aesthetic and educational value'
    ],
    limitations: [
      'Requires large land area',
      'Performance seasonal in cold climates',
      'Not suited to drought or water-scarce areas',
      'Mosquito management required'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Heatwave'],
    typology: ['Coastal', 'Flood Prone', 'Rain Intensive'],
    matrixCategory: 'Nature-based',
    matrixContext: 'Wetland/coastal zones; natural treatment using aquatic plants',
    hazardSuitability: {
      'Flood': 'conditional',
      'Flash Flood': 'not_suitable',
      'Drought': 'not_suitable',
      'Cyclone': 'not_suitable',
      'Heatwave': 'conditional',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'recommended',
      'Coastal Flooding': 'recommended',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'not_suitable',
    },
  },

  'composting-dry': {
    slug: 'composting-dry',
    title: 'Composting Toilet (Dry)',
    category: 'sanitation',
    description: 'Dry composting toilets require no water and decompose waste aerobically into pathogen-free compost. Ideal for water-scarce areas and hilly terrain where pit excavation is difficult. Produces valuable soil amendment.',
    climateResilience: 'Excellent climate resilience in drought and water-scarce conditions. Requires no water, making it ideal where water is scarce. Can be relocated after disasters. Functions in hilly, rocky terrain where pit-based systems are not feasible.',
    suitableConditions: [
      'Drought-prone and arid zones',
      'Hilly and rocky terrain',
      'Post-disaster settings',
      'Water-scarce rural communities'
    ],
    advantages: [
      'Zero water consumption',
      'Produces safe compost for soil amendment',
      'Relocatable in emergency settings',
      'No groundwater contamination risk',
      'Suitable for rock/hilly terrain'
    ],
    limitations: [
      'Regular management of composting chambers needed',
      'Community behaviour change required',
      'Odour management essential',
      'Not suited to flood or waterlogged areas'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'Low',
    relatedHazards: ['Drought', 'Heatwave'],
    typology: ['Desert / Arid', 'Rocky / Hilly'],
    matrixCategory: 'Dry',
    matrixContext: 'Water-scarce / drought areas; no water needed; produces fertiliser',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'recommended',
      'Cyclone': 'conditional',
      'Heatwave': 'recommended',
      'Cold Wave': 'conditional',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'conditional',
      'Post-Disaster': 'conditional',
      'Rocky Terrain': 'conditional',
    },
  },

  'uddt': {
    slug: 'uddt',
    title: 'Urine Diverting Dry Toilet (UDDT)',
    category: 'sanitation',
    description: 'UDDTs separate urine from faeces at source. Urine is diverted and used as liquid fertiliser. Faeces are separately composted in a dry chamber. Developed for arid zones where water and nutrient recovery is critical.',
    climateResilience: 'Excellent for drought contexts. Zero water required. Urine diversion reduces leachate risk. Recovers nutrients for agriculture — important in climate-stressed farming communities. Can function in hilly or rocky terrain.',
    suitableConditions: [
      'Arid and drought-prone regions',
      'Agricultural communities needing fertiliser',
      'Water-scarce rural areas',
      'Hilly or rocky terrain'
    ],
    advantages: [
      'No water required',
      'Urine recovered as nitrogen-rich fertiliser',
      'No groundwater contamination',
      'Suitable for rocky terrain',
      'Supports circular sanitation economy'
    ],
    limitations: [
      'Behavioural change required (urine diversion)',
      'Regular management of faeces chamber',
      'Community acceptance can be challenging',
      'Not suited to flood or waterlogged settings'
    ],
    maintenanceLevel: 'Medium',
    costLevel: 'Low',
    relatedHazards: ['Drought', 'Heatwave'],
    typology: ['Desert / Arid', 'Rocky / Hilly'],
    matrixCategory: 'Dry',
    matrixContext: 'Arid / drought zones; separates urine for use as fertiliser',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'recommended',
      'Cyclone': 'conditional',
      'Heatwave': 'recommended',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'conditional',
      'Post-Disaster': 'conditional',
      'Rocky Terrain': 'conditional',
    },
  },

  'arborloo': {
    slug: 'arborloo',
    title: 'Arborloo (Tree Pit Toilet)',
    category: 'sanitation',
    description: 'The Arborloo is a relocatable single pit latrine where a tree is planted when the pit fills. The shallow pit decomposes and fertilises the tree. Ideal for post-disaster settings and areas with limited materials.',
    climateResilience: 'Highly adaptable emergency solution. Relocatable when hazard event passes. Shallow pit avoids groundwater contamination risk. Tree planting provides long-term ecological co-benefit and slope stabilisation in cyclone/landslide-prone areas.',
    suitableConditions: [
      'Post-disaster temporary settings',
      'Cyclone and earthquake-prone areas',
      'Areas with loose or unconsolidated soil',
      'Communities that value tree planting'
    ],
    advantages: [
      'Very low cost — only requires a slab and superstructure',
      'Relocatable after pit is full',
      'Tree planted provides long-term site stabilisation',
      'Simple community construction',
      'Rapid deployment in emergencies'
    ],
    limitations: [
      'Short-term solution only',
      'Shallow pit risks groundwater contamination on sandy soils',
      'Not suitable for rocky terrain',
      'Requires follow-up to a permanent solution'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Cyclone', 'Earthquake'],
    typology: ['Plains / Alluvial', 'Rain Intensive'],
    matrixCategory: 'Eco/Emergency',
    matrixContext: 'Cyclone/post-disaster areas; shallow pit + tree planting; relocatable',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'not_suitable',
      'Cyclone': 'conditional',
      'Heatwave': 'not_suitable',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'conditional',
      'Post-Disaster': 'recommended',
      'Rocky Terrain': 'not_suitable',
    },
  },

  'cbs': {
    slug: 'cbs',
    title: 'Container-Based Sanitation (CBS)',
    category: 'sanitation',
    description: 'CBS systems use sealed, exchangeable containers to capture faeces with no pit or sewer required. Containers are collected regularly and treated off-site. Used in dense urban informal settlements and emergency deployments.',
    climateResilience: 'Highest climate resilience of any sanitation technology — functional in all hazard conditions. Sealed design prevents contamination during floods. Portable during emergencies. Suitable for dense urban areas without land for pits.',
    suitableConditions: [
      'Dense urban informal settlements',
      'Post-disaster and emergency settings',
      'Coastal and flood-prone urban areas',
      'Any hazard context where other solutions fail'
    ],
    advantages: [
      'Functional in any climate hazard condition',
      'No land required for pit or sewer',
      'Sealed — prevents open defecation disease',
      'Rapid deployment in emergencies',
      'Creates sanitation employment'
    ],
    limitations: [
      'Requires regular, reliable collection service',
      'Higher operational cost than pit-based systems',
      'Supply chain for containers and treatment needed',
      'Community trust in service continuity required'
    ],
    maintenanceLevel: 'High',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Cyclone', 'Earthquake'],
    typology: ['Plains / Alluvial', 'Coastal', 'Flood Prone'],
    matrixCategory: 'Urban/Emergency',
    matrixContext: 'Dense urban informal settlements; sealed containers collected regularly',
    hazardSuitability: {
      'Flood': 'conditional',
      'Flash Flood': 'conditional',
      'Drought': 'conditional',
      'Cyclone': 'conditional',
      'Heatwave': 'conditional',
      'Cold Wave': 'conditional',
      'Waterlogging': 'conditional',
      'Coastal Flooding': 'conditional',
      'Earthquake': 'conditional',
      'Post-Disaster': 'recommended',
      'Rocky Terrain': 'not_suitable',
      'Urban Dense': 'recommended',
    },
  },

  'skyloo': {
    slug: 'skyloo',
    title: 'Skyloo / High-Rise Pit Toilet',
    category: 'sanitation',
    description: 'A Skyloo uses an extended drop pipe (3–6 m) from a ground-level toilet into a deep pit located in hilly or rocky terrain where standard excavation is not feasible. Developed for India\'s rocky hill districts.',
    climateResilience: 'Specifically designed for rocky and hilly terrain where no other pit-based system works. The drop pipe skips rocky strata to reach soil. Minimal water use. Functions in cold waves due to underground pit insulation.',
    suitableConditions: [
      'Rocky and hilly terrain',
      'High-altitude communities',
      'Areas with thin or rocky topsoil',
      'Cold climate hill districts'
    ],
    advantages: [
      'Only option in rocky terrain where pits cannot be dug',
      'Long drop pipe eliminates odour at ground level',
      'Low water consumption',
      'Durable in cold conditions'
    ],
    limitations: [
      'Design-specific to rocky/hilly terrain only',
      'Requires skilled installation of the drop pipe',
      'Not suitable for flood or waterlogged areas',
      'Superstructure needs wind-resistant design in exposed sites'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Cold Wave'],
    typology: ['Rocky / Hilly'],
    matrixCategory: 'Terrain-specific',
    matrixContext: 'Hilly / rocky terrain; extended drop pipe into deep pit',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'not_suitable',
      'Cyclone': 'conditional',
      'Heatwave': 'not_suitable',
      'Cold Wave': 'conditional',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'conditional',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'recommended',
    },
  },

  'emergency-latrine': {
    slug: 'emergency-latrine',
    title: 'Trench / Emergency Latrine',
    category: 'sanitation',
    description: 'Emergency trench latrines are shallow, shared trenches with a superstructure for rapid deployment in mass-displacement situations. They provide immediate sanitation coverage within hours of a disaster.',
    climateResilience: 'Designed for immediate post-disaster deployment. Rapid construction requires only hand tools. Not climate-resilient in the long term — intended as a bridge solution for 1–4 weeks before transitioning to semi-permanent technology.',
    suitableConditions: [
      'Post-disaster displacement camps',
      'Mass casualty events requiring rapid sanitation',
      'Earthquake, cyclone, or flood aftermath',
      'Areas where all infrastructure is destroyed'
    ],
    advantages: [
      'Extremely rapid deployment (hours)',
      'Near-zero cost — only requires digging',
      'No materials needed beyond a superstructure',
      'Can be closed and replaced easily'
    ],
    limitations: [
      'Temporary solution only (< 4 weeks)',
      'High risk of groundwater contamination',
      'Not functional during flooding or waterlogging',
      'Requires transition plan to permanent technology'
    ],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Earthquake', 'Cyclone'],
    typology: ['Plains / Alluvial'],
    matrixCategory: 'Emergency',
    matrixContext: 'Post-disaster temporary; mass displacement; rapid deployment',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'not_suitable',
      'Cyclone': 'not_suitable',
      'Heatwave': 'not_suitable',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'recommended',
      'Post-Disaster': 'recommended',
      'Rocky Terrain': 'not_suitable',
    },
  },

  'sewered-flush': {
    slug: 'sewered-flush',
    title: 'Sewered Flush (Conventional)',
    category: 'sanitation',
    description: 'Conventional sewered flush toilets connect to a piped sewer network for centralized wastewater treatment. The standard urban sanitation technology — but requires piped water supply, sewer infrastructure, and functioning treatment plant.',
    climateResilience: 'Limited climate resilience. Dependent on grid water supply, electricity, and infrastructure integrity — all vulnerable to climate shocks. Not suitable for water-scarce areas. Urban settings with maintained infrastructure perform well.',
    suitableConditions: [
      'Urban areas with piped water and sewer networks',
      'Cities with functioning wastewater treatment plants',
      'Dense urban settlements'
    ],
    advantages: [
      'High user acceptability and comfort',
      'Hygienic when combined with soap and handwashing',
      'Scalable to city level with sewer network',
      'Removes waste from household environment'
    ],
    limitations: [
      'Requires piped water supply — not suitable for drought areas',
      'Sewer network requires high capital investment',
      'Fails completely during power or water supply outages',
      'Not suitable for rural or water-scarce settings'
    ],
    maintenanceLevel: 'High',
    costLevel: 'High',
    relatedHazards: [],
    typology: ['Plains / Alluvial'],
    matrixCategory: 'Sewered',
    matrixContext: 'Urban with piped water & sewer network; not suitable for water-scarce areas',
    hazardSuitability: {
      'Flood': 'not_suitable',
      'Flash Flood': 'not_suitable',
      'Drought': 'not_suitable',
      'Cyclone': 'not_suitable',
      'Heatwave': 'not_suitable',
      'Cold Wave': 'not_suitable',
      'Waterlogging': 'not_suitable',
      'Coastal Flooding': 'not_suitable',
      'Earthquake': 'not_suitable',
      'Post-Disaster': 'not_suitable',
      'Rocky Terrain': 'not_suitable',
      'Urban Dense': 'recommended',
    },
  },

  // ─────────────────────────────────────────────────────────────
  // LIQUID WASTE MANAGEMENT TECHNOLOGIES (from Excel dataset)
  // ─────────────────────────────────────────────────────────────

  'settler-sedimentation-tank': {
    slug: 'settler-sedimentation-tank',
    title: 'Settler / Sedimentation Tank',
    category: 'waste',
    description: 'Gravity-based primary pre-treatment unit that removes settleable solids before downstream biological treatment. Widely used as the first stage in DEWATS trains across India. Capacity: 1–500 KLD. Indian case studies: CDD India — 450+ DEWATS across India; Agra DEWATS (Kachhpura drain).',
    climateResilience: 'High — fully underground gravity-driven unit performs consistently across all climate zones and weather events. No energy dependency means it continues operating during grid failures caused by cyclones or floods.',
    suitableConditions: [
      'All climate hazard contexts and zones',
      'First stage in DEWATS or multi-stage treatment trains',
      'Capacity range: 1–500 KLD',
      'Rural, peri-urban, and urban settlements',
      'Reuse: settled sludge for composting',
    ],
    advantages: ['No energy needed; simple gravity design', 'Reliable in all weather and climate zones', 'Low maintenance; periodic desludging only', 'Removes 50–70% TSS and 25–40% BOD', 'Design life: 20–30 years'],
    limitations: ['Low BOD removal alone — needs downstream treatment', 'Requires periodic desludging every 2–5 years', 'Does not remove dissolved nutrients or pathogens effectively'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Flood', 'Heatwave', 'Drought', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Primary',
    matrixContext: 'Universal first-stage treatment; underground placement ensures climate resilience across all zones',
    hazardSuitability: { 'Flood': 'recommended', 'Heatwave': 'recommended', 'Drought': 'recommended', 'Cyclone': 'recommended', 'Cold Wave': 'recommended', 'Dust Storm': 'recommended' },
  },

  'septic-tank-improved': {
    slug: 'septic-tank-improved',
    title: 'Improved Septic Tank',
    category: 'waste',
    description: 'Underground primary treatment chamber for domestic wastewater using anaerobic digestion and sedimentation. Improved designs include sealed lids and effluent filters to prevent groundwater contamination. Capacity: 1–200 KLD. Indian case studies: SBM Phase 1 — millions installed across rural India; CPCB guidelines available.',
    climateResilience: 'High — below-ground installation protects from temperature extremes. Requires sealed construction in flood-prone zones to prevent ingress of floodwater that dilutes treatment and contaminates groundwater.',
    suitableConditions: [
      'All climate zones when properly sealed',
      'Rural, peri-urban and urban settings',
      'Capacity range: 1–200 KLD',
      'Areas with access to desludging services',
      'Reuse: sludge for co-composting',
    ],
    advantages: ['Widely understood; no energy required', 'Decentralised and proven at massive scale', 'Removes 50–70% TSS and 30–50% BOD', 'Long operational life: 15–25 years', 'Compatible with SBM guidelines'],
    limitations: ['Effluent still high BOD — needs secondary treatment', 'Groundwater contamination risk if not sealed', 'Flood ingress risk if above-ground components not sealed', 'Requires regular desludging'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave', 'Drought', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Primary',
    matrixContext: 'Universal pre-treatment; seal tank lids and inlet/outlet in flood-prone zones',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'recommended', 'Cyclone': 'recommended', 'Cold Wave': 'recommended', 'Dust Storm': 'recommended' },
  },

  'biogas-digester-kvic': {
    slug: 'biogas-digester-kvic',
    title: 'Biogas Digester (KVIC / Deenbandhu)',
    category: 'waste',
    description: 'Anaerobic digester producing biogas (0.3–0.5 m³/capita/day) from organic waste and wastewater. The fixed-dome Deenbandhu design is widely used across India. Capacity: 1–100 KLD. Indian case studies: MNRE biogas programme; SNV biogas projects; UNDP-GEF supported installations.',
    climateResilience: 'Medium — performance peaks in tropical heat (>20°C). Biogas yield declines significantly below 15°C. Water requirement for slurry makes it drought-sensitive. Underground dome provides flood and cyclone resilience.',
    suitableConditions: [
      'Tropical and sub-tropical zones with average temp >20°C',
      'Agricultural communities with consistent organic feedstock',
      'Capacity range: 1–100 KLD',
      'Areas with water availability for slurry preparation',
      'Reuse: biogas for cooking; digestate for crop nutrition',
    ],
    advantages: ['Energy recovery reduces household fuel cost', 'Produces nutrient-rich digestate for farms', 'Reduces GHG emissions vs open pits', 'Proven at scale under MNRE programme', 'BOD removal: 40–60%'],
    limitations: ['Performance drops below 15°C', 'Needs consistent feedstock and water for slurry', 'Drought-sensitive due to water dependency', 'Skilled mason needed for dome construction'],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Primary + Energy',
    matrixContext: 'Optimal in warm tropical zones; fixed-dome design provides flood and cyclone resilience',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'not_suitable', 'Cyclone': 'conditional', 'Cold Wave': 'not_suitable' },
  },

  'anaerobic-baffled-reactor': {
    slug: 'anaerobic-baffled-reactor',
    title: 'Anaerobic Baffled Reactor (ABR)',
    category: 'waste',
    description: 'Underground secondary anaerobic treatment unit with baffled chambers that force wastewater through a series of up-flow and down-flow zones, achieving high BOD removal with zero energy. Core component of DEWATS trains. Capacity: 5–500 KLD. Indian case studies: CDD India DEWATS; BORDA projects in Karnataka, Tamil Nadu; CSE documentation.',
    climateResilience: 'High — fully underground sealed construction makes it highly resilient to floods, cyclones, heatwaves, and drought. No energy dependency. Performs consistently across all Indian climate zones.',
    suitableConditions: [
      'All climate zones as secondary treatment stage',
      'Downstream of primary settler in DEWATS',
      'Capacity range: 5–500 KLD',
      'Handles shock loads from seasonal population changes',
      'Reuse: effluent polished by constructed wetland',
    ],
    advantages: ['Zero energy; fully gravity-driven', 'Underground = climate-proof against all hazards', 'Modular and scalable design', 'Handles organic shock loads effectively', 'BOD removal: 70–90%; design life: 20–30 years'],
    limitations: ['Requires primary treatment upstream (settler)', '2–3 month startup time for biofilm establishment', 'Lower removal efficiency than aerobic systems', 'Periodic desludging required every 3–5 years'],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Heatwave', 'Drought', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Secondary Anaerobic',
    matrixContext: 'Universal secondary treatment; underground placement ensures climate resilience in all hazard contexts',
    hazardSuitability: { 'Flood': 'recommended', 'Heatwave': 'recommended', 'Drought': 'recommended', 'Cyclone': 'recommended', 'Cold Wave': 'recommended', 'Dust Storm': 'recommended' },
  },

  'anaerobic-filter': {
    slug: 'anaerobic-filter',
    title: 'Anaerobic Filter (AF)',
    category: 'waste',
    description: 'Underground fixed-media anaerobic reactor where biofilm attached to filter media (gravel, plastic) achieves high-efficiency BOD and TSS removal. Used as polishing stage after ABR in DEWATS trains. Capacity: 5–500 KLD. Indian case studies: DEWATS modules across India; CDD India; SuSanA case studies.',
    climateResilience: 'High — fully underground with no energy dependency. Compact footprint and enclosed design make it resilient to all climate hazards. Filter media retains biofilm even after hydraulic shocks from flood events.',
    suitableConditions: [
      'All climate zones as secondary or tertiary stage',
      'After ABR in DEWATS or standalone secondary treatment',
      'Capacity range: 5–500 KLD',
      'Sites requiring compact footprint',
      'Reuse: polished effluent suitable for irrigation reuse',
    ],
    advantages: ['Compact footprint vs open systems', 'Zero energy; biofilm retained on media', 'High removal efficiency: BOD 85–95%', 'Underground = resistant to all climate hazards', 'Reliable steady-state performance'],
    limitations: ['Filter media may clog over time with high TSS influent', 'Desludging of media needed periodically', 'Higher capital cost than ABR alone', 'Requires upstream primary treatment'],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Heatwave', 'Drought', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Secondary Anaerobic',
    matrixContext: 'Underground enclosed design; suitable for all hazard contexts; used as DEWATS component',
    hazardSuitability: { 'Flood': 'recommended', 'Heatwave': 'recommended', 'Drought': 'recommended', 'Cyclone': 'recommended', 'Cold Wave': 'recommended' },
  },

  'uasb-reactor': {
    slug: 'uasb-reactor',
    title: 'UASB Reactor',
    category: 'waste',
    description: 'Upflow Anaerobic Sludge Blanket reactor designed for high-rate anaerobic treatment of municipal wastewater with biogas recovery at semi-urban to urban scale. Capacity: 50–5,000 KLD. Indian case studies: Kanpur UASB; multiple NRCD installations; Yamuna Action Plan STPs.',
    climateResilience: 'Medium — performance is optimal in tropical zones (>20°C). Above-ground structures are vulnerable to cyclone wind loading. Efficiencies drop below 15°C. Consistent inflow needed — droughts that reduce flow can disturb sludge blanket.',
    suitableConditions: [
      'Tropical and sub-tropical zones with avg temp >20°C',
      'Semi-urban to municipal scale (50–5,000 KLD)',
      'Where biogas recovery adds economic value',
      'Urban areas with skilled O&M capacity',
      'Reuse: biogas recovery; treated effluent for secondary reuse',
    ],
    advantages: ['High organic load handling capacity', 'Biogas recovery adds energy value', 'Compact footprint for high flow rates', 'Proven at municipal scale in India', 'BOD removal: 80–90%'],
    limitations: ['Needs skilled operation; sensitive to shock loads', 'Performance poor below 15°C', 'Above-ground structures vulnerable to cyclone winds', 'Sludge granulation takes 2–4 months startup'],
    maintenanceLevel: 'High',
    costLevel: 'Medium',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Secondary Anaerobic',
    matrixContext: 'Best in warm tropical zones; above-ground components need wind bracing in cyclone-prone areas',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'conditional', 'Cyclone': 'not_suitable', 'Cold Wave': 'not_suitable' },
  },

  'constructed-wetland-horizontal': {
    slug: 'constructed-wetland-horizontal',
    title: 'Constructed Wetland — Horizontal Flow',
    category: 'waste',
    description: 'Nature-based secondary/tertiary treatment system where wastewater flows horizontally through a gravel bed planted with emergent macrophytes (Phragmites, Typha). Combines physical filtration, microbial degradation, and plant uptake. Capacity: 1–200 KLD. Indian case studies: CDD India; CSE projects; Auroville (Pondicherry); multiple rural installations.',
    climateResilience: 'High — nature-based system performs well across most climates. Requires berm protection in flood zones. Plants need minimum soil moisture — limited performance during extreme drought. Seasonal variation in treatment rates.',
    suitableConditions: [
      'All climate zones with adaptation of berm height for flood areas',
      'Tertiary polishing after anaerobic treatment',
      'Capacity range: 1–200 KLD',
      'Sites with available land for planted beds',
      'Reuse: treated water for irrigation and aquifer recharge',
    ],
    advantages: ['Zero energy; nature-based treatment', 'Excellent pathogen removal in sunlight exposure', 'Habitat creation and aesthetic value', 'Easy O&M with basic skills', 'BOD removal: 75–90%'],
    limitations: ['Large land requirement (5–15 m²/KLD)', 'Plant management needed; may clog if overloaded', 'Drought reduces treatment efficiency', 'Flood zones need raised berm protection'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Tertiary Nature-Based',
    matrixContext: 'Raise bed berms 0.5–1 m above flood line; select drought-tolerant reed species for arid zones',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'not_suitable', 'Cyclone': 'conditional', 'Cold Wave': 'conditional' },
  },

  'constructed-wetland-vertical': {
    slug: 'constructed-wetland-vertical',
    title: 'Constructed Wetland — Vertical Flow',
    category: 'waste',
    description: 'Intermittently dosed nature-based tertiary treatment system where wastewater is applied to the surface and percolates vertically through a gravel-sand bed with planted macrophytes, achieving superior nitrification vs horizontal flow systems. Capacity: 1–200 KLD. Indian case studies: CDD India hybrid wetland systems; NIT Rourkela research installations.',
    climateResilience: 'High — raised bed construction provides better flood resilience than horizontal flow. Intermittent dosing mechanism needs protection from flooding. Drought reduces available dosing water. Overall robust design for tropical climates.',
    suitableConditions: [
      'All climate zones with surface protection in flood zones',
      'Where nitrified effluent for irrigation reuse is needed',
      'Capacity range: 1–200 KLD',
      'As hybrid system after horizontal flow CW',
      'Reuse: nitrified effluent for crop irrigation',
    ],
    advantages: ['Better nitrification than horizontal flow', 'Smaller footprint than horizontal CW', 'Raised bed improves flood resilience', 'Zero energy (gravity dosing)', 'BOD removal: 80–92%'],
    limitations: ['Needs dosing mechanism — more complex than horizontal CW', 'Distribution pipes may clog with biofilm', 'Drought reduces dosing water availability', 'Slightly higher capital than horizontal CW'],
    maintenanceLevel: 'Low',
    costLevel: 'Medium',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Tertiary Nature-Based',
    matrixContext: 'Raised bed construction; suitable for all zones; combine with horizontal CW for complete nutrient removal',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'not_suitable', 'Cyclone': 'conditional', 'Cold Wave': 'conditional' },
  },

  'waste-stabilization-pond': {
    slug: 'waste-stabilization-pond',
    title: 'Waste Stabilization Pond (WSP)',
    category: 'waste',
    description: 'Series of shallow open ponds (anaerobic, facultative, maturation) using sunlight, wind, and algae for wastewater treatment. Achieves highest pathogen removal of any low-cost technology through UV disinfection. Capacity: 10–1,000 KLD. Indian case studies: Multiple installations across Rajasthan, MP, Maharashtra; WHO WSP design guidelines.',
    climateResilience: 'Medium — optimal in hot arid zones with high solar radiation. Open surface ponds overflow during floods, suffer evaporation losses in drought, and wind dispersal of surface algae in cyclones. Cold and cloudy weather reduces performance significantly.',
    suitableConditions: [
      'Hot arid and semi-arid zones with high solar radiation',
      'Areas with large land availability (0.1–0.3 ha/100 m³/day)',
      'Capacity range: 10–1,000 KLD',
      'Where aquaculture or crop irrigation reuse is planned',
      'Reuse: pond effluent for aquaculture and crop irrigation',
    ],
    advantages: ['Highest pathogen removal of any passive treatment', 'Extremely low capital and O&M cost', 'Solar UV-powered — no chemicals or energy', 'BOD removal: 80–95%; design life: 25+ years', 'Compatible with aquaculture reuse'],
    limitations: ['Very large land requirement (largest of all options)', 'Ponds overflow and contaminate in flood events', 'High evaporation — up to 30% water loss in drought zones', 'Algae blooms and odor management challenges'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave'],
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    matrixCategory: 'Liquid Waste — Tertiary Pond',
    matrixContext: 'Best in hot arid and sunny zones; embankment strengthening needed in cyclone-prone areas; poor choice for flood plains',
    hazardSuitability: { 'Flood': 'not_suitable', 'Heatwave': 'recommended', 'Drought': 'not_suitable', 'Cyclone': 'not_suitable', 'Cold Wave': 'not_suitable' },
  },

  'duckweed-pond': {
    slug: 'duckweed-pond',
    title: 'Duckweed Pond',
    category: 'waste',
    description: 'Shallow treatment pond covered by fast-growing Lemna/Spirodela duckweed that absorbs nutrients and provides protein-rich biomass for animal feed or compost. Achieves biological nutrient removal alongside BOD treatment. Capacity: 5–200 KLD. Indian case studies: Research projects at IIT Kharagpur; pilot installations in West Bengal.',
    climateResilience: 'Medium — duckweed grows rapidly in tropical heat and can double in biomass in 1–2 days. Flood events wash away the duckweed mat. Cyclonic winds disperse the floating mat. Drought reduces pond water levels affecting duckweed growth.',
    suitableConditions: [
      'Tropical and sub-tropical zones (avg temp >18°C)',
      'Agricultural communities interested in biomass recovery',
      'Capacity range: 5–200 KLD',
      'After primary or secondary treatment for nutrient polishing',
      'Reuse: duckweed biomass for animal feed or compost',
    ],
    advantages: ['Nutrient removal while producing protein biomass', 'Natural treatment with low energy input', 'Duckweed harvesting provides livelihood opportunity', 'BOD removal: 70–85% with nutrient uptake', 'Low capital cost comparable to stabilization ponds'],
    limitations: ['Harvesting is labour-intensive', 'Duckweed mat destroyed by flooding and wind', 'Sensitive to heavy metals and pH extremes', 'Requires consistent management and harvesting schedule'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Rain Intensive'],
    matrixCategory: 'Liquid Waste — Tertiary Pond',
    matrixContext: 'Tropical zones only; pond embankments needed in flood areas; harvest before cyclone events',
    hazardSuitability: { 'Flood': 'not_suitable', 'Heatwave': 'recommended', 'Drought': 'conditional', 'Cyclone': 'not_suitable', 'Cold Wave': 'not_suitable' },
  },

  'polishing-pond': {
    slug: 'polishing-pond',
    title: 'Polishing Pond (Maturation Pond)',
    category: 'waste',
    description: 'Shallow final-stage open pond that achieves solar UV disinfection of treated wastewater effluent. Removes residual pathogens after biological treatment, producing reuse-grade effluent suitable for restricted irrigation. Capacity: 10–500 KLD. Indian case studies: Post-WSP installations across India; CSE documented cases.',
    climateResilience: 'Medium — highly effective in sunny hot conditions where solar UV inactivates pathogens rapidly. Open surface vulnerable to flooding, cyclone wind, and debris contamination. Performance reduced in cold, cloudy monsoon months.',
    suitableConditions: [
      'Hot zones with high solar radiation and low cloud cover',
      'Final polishing stage after biological secondary treatment',
      'Capacity range: 10–500 KLD',
      'Where reuse-grade disinfected effluent is needed',
      'Reuse: reuse-grade effluent for restricted irrigation and aquaculture',
    ],
    advantages: ['Final pathogen kill using only solar UV energy', 'No chemicals required; zero energy; simple design', 'Solar disinfection effective in hot sunny climates', 'Compatible with aquaculture reuse schemes', 'Very low cost: ₹2,000–5,000/KLD capital'],
    limitations: ['Open surface overflows and contaminates during floods', 'Minimal additional BOD removal over upstream stages', 'Algae management needed to avoid oxygen depletion', 'Evaporation losses in drought zones'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave'],
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    matrixCategory: 'Liquid Waste — Tertiary Polishing',
    matrixContext: 'Hot sunny zones only; embankment protection in flood-prone areas; not suitable for cold or heavily clouded regions',
    hazardSuitability: { 'Flood': 'not_suitable', 'Heatwave': 'recommended', 'Drought': 'not_suitable', 'Cyclone': 'not_suitable', 'Cold Wave': 'not_suitable' },
  },

  'sand-gravel-filter': {
    slug: 'sand-gravel-filter',
    title: 'Sand / Gravel Filter (Slow Sand)',
    category: 'waste',
    description: 'Underground or covered filter bed using layered gravel and fine sand media to remove residual suspended solids and pathogens from secondary-treated effluent. Used as a final polishing stage in DEWATS. Capacity: 1–100 KLD. Indian case studies: Multiple DEWATS post-treatment stages; CDD India; drinking water treatment adaptations.',
    climateResilience: 'High — enclosed or underground construction makes it highly resistant to flooding, cyclones, and heatwave. Requires periodic backwash water availability which may be constrained in drought periods. No energy needed for operation.',
    suitableConditions: [
      'All climate zones as final polishing stage',
      'Downstream of secondary biological treatment',
      'Capacity range: 1–100 KLD',
      'Sites requiring high-quality reuse water',
      'Reuse: high-quality reuse water for irrigation and groundwater recharge',
    ],
    advantages: ['Excellent TSS polishing — removes remaining suspended solids', 'Simple and reliable; no energy; no chemicals', 'Underground or enclosed = climate-proof', 'Long service life with periodic media replacement', 'TSS removal: 90–99%; pathogen reduction: 2–3 log'],
    limitations: ['Periodic cleaning and media replacement required', 'Clogs with high solids loading — needs quality influent', 'Backwash water demand may be an issue in drought areas'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Flood', 'Heatwave', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Tertiary Polishing',
    matrixContext: 'Enclosed/underground; climate-resilient in all zones; backwash water availability needed in drought zones',
    hazardSuitability: { 'Flood': 'recommended', 'Heatwave': 'recommended', 'Drought': 'conditional', 'Cyclone': 'recommended', 'Cold Wave': 'recommended' },
  },

  'root-zone-treatment': {
    slug: 'root-zone-treatment',
    title: 'Root Zone Treatment System (RZTS)',
    category: 'waste',
    description: 'Nature-based polishing system where wastewater flows through gravel beds planted with aquatic macrophytes, using root-zone microbial activity for treatment. Suitable for household to community scale in tropical climates. Capacity: 1–50 KLD. Indian case studies: Auroville; household-level installations; CSE promoted technology.',
    climateResilience: 'Medium — plants grow vigorously in humid tropical conditions but die back during drought or cold spells. Above-ground vegetation is susceptible to cyclone damage. Surface system at moderate flood risk. Best suited to humid tropical and sub-tropical zones.',
    suitableConditions: [
      'Humid tropical and sub-tropical zones',
      'Household to community scale (1–50 KLD)',
      'Final polishing after primary or secondary treatment',
      'Sites where aesthetic value adds community acceptance',
      'Reuse: treated water for kitchen gardening and landscaping',
    ],
    advantages: ['Nature-based; zero energy; community-accepted', 'Aesthetic value promotes adoption', 'Educational value for school and community settings', 'BOD removal: 75–90% with proper operation', 'Suitable for household and school-level applications'],
    limitations: ['Plant die-off in drought or cold weather reduces performance', 'Limited capacity (household to community scale only)', 'Gravel media replacement needed periodically', 'Above-ground vegetation at cyclone risk'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Rain Intensive', 'Coastal'],
    matrixCategory: 'Liquid Waste — Tertiary Nature-Based',
    matrixContext: 'Humid tropical zones; not recommended for drought-prone or cyclone-exposed sites without plant replacement plan',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'not_suitable', 'Cyclone': 'conditional', 'Cold Wave': 'not_suitable' },
  },

  'greywater-garden': {
    slug: 'greywater-garden',
    title: 'Greywater Garden / Leach Pit',
    category: 'waste',
    description: 'Simple on-site greywater management system directing kitchen and bathing wastewater to a planted leach pit or garden trench for infiltration and plant uptake. Extremely low-cost household adaptation for water-scarce areas. Capacity: 0.1–2 KLD per household. Indian case studies: SBM greywater management guidelines; WaterAid India compendium.',
    climateResilience: 'Medium — highly effective in semi-arid and arid zones where greywater reuse directly benefits kitchen gardens and reduces freshwater demand. Leach pits flood and overflow in waterlogged areas. Not suitable for blackwater.',
    suitableConditions: [
      'Semi-arid and arid zones where water reuse is critical',
      'Household scale greywater management (0.1–2 KLD)',
      'Kitchen and bathing wastewater only — not blackwater',
      'Rural and peri-urban communities with kitchen gardens',
      'Reuse: direct kitchen garden irrigation from greywater',
    ],
    advantages: ['Extremely low cost (₹500–3,000 per household)', 'Immediate water reuse benefit for kitchen gardens', 'Household level — no infrastructure required', 'Promotes food security through water recycling', 'Reduces open drainage in semi-arid villages'],
    limitations: ['Handles greywater only — not blackwater or toilet waste', 'Soil clogging over time requires pit relocation', 'Not suitable in high water table or flood-prone areas', 'Limited to small household volumes'],
    maintenanceLevel: 'Low',
    costLevel: 'Low',
    relatedHazards: ['Drought'],
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    matrixCategory: 'Liquid Waste — On-site Greywater',
    matrixContext: 'Optimal in semi-arid and arid zones; avoid in flood-prone and high water table areas; greywater only',
    hazardSuitability: { 'Flood': 'not_suitable', 'Heatwave': 'conditional', 'Drought': 'recommended', 'Cyclone': 'conditional', 'Cold Wave': 'conditional' },
  },

  'greywater-recycling-unit': {
    slug: 'greywater-recycling-unit',
    title: 'Greywater Recycling Unit (Packaged)',
    category: 'waste',
    description: 'Compact packaged unit integrating physical filtration, biological treatment, and disinfection for household to small community greywater recycling. Produces reuse-grade water for toilet flushing, gardening, and floor washing, reducing freshwater demand by 40–60%. Capacity: 0.5–50 KLD. Indian case studies: Urban installations in Bengaluru, Delhi; IGBC green building projects.',
    climateResilience: 'Medium — compact enclosed construction protects from most climate events. Highly effective in drought-prone water-scarce areas where water recycling is critical. Requires electricity for pump and UV disinfection. Not widely available in rural India.',
    suitableConditions: [
      'Water-scarce drought-prone zones',
      'Urban buildings, apartments, institutions (0.5–50 KLD)',
      'Green buildings and IGBC-rated construction',
      'Areas with intermittent water supply',
      'Reuse: toilet flushing, floor washing, garden irrigation',
    ],
    advantages: ['Reduces freshwater demand by 40–60%', 'Compact enclosed unit; quick installation', 'High-quality reuse water output', 'Protects groundwater by minimising extraction', 'Modular and scalable for building clusters'],
    limitations: ['Requires electricity for pump and UV disinfection', 'Regular filter replacement needed (every 3–6 months)', 'Not widely manufactured in rural India', 'Higher capital cost than simple systems'],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Drought', 'Cyclone'],
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    matrixCategory: 'Liquid Waste — Greywater Recycling',
    matrixContext: 'Best in water-scarce drought-prone urban/peri-urban areas; enclosed unit provides cyclone and flood protection',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'conditional', 'Drought': 'recommended', 'Cyclone': 'recommended', 'Cold Wave': 'conditional' },
  },

  'faecal-sludge-co-composting': {
    slug: 'faecal-sludge-co-composting',
    title: 'Faecal Sludge Co-Composting',
    category: 'waste',
    description: 'Thermophilic composting of faecal sludge from pit latrines or septic tanks mixed with organic solid waste (bulking agent) to produce pathogen-free agricultural compost. A core FSSM (Faecal Sludge and Septage Management) technology. Capacity: 1–50 tonnes/day. Indian case studies: TNUSSP Tamil Nadu; Devanahalli Karnataka; multiple ULB installations under SBM-U.',
    climateResilience: 'High — thermophilic process is enhanced by heatwave conditions (50–65°C compost pile temperatures). No water requirement makes it drought-resilient. Covered shed needed for cyclone and flood protection. Very effective in hot arid climates.',
    suitableConditions: [
      'Hot arid and semi-arid zones (accelerated thermophilic kill)',
      'Urban local bodies with FSM service delivery',
      'Capacity range: 1–50 tonnes of sludge per day',
      'Areas with consistent organic solid waste supply as bulking agent',
      'Reuse: agricultural-grade compost for soil amendment',
    ],
    advantages: ['No water needed — drought-resilient process', 'Produces valuable agricultural compost', 'Heat kills pathogens — safe end product', 'Low-tech and decentralised implementation possible', 'Pathogen reduction: 3–4 log10'],
    limitations: ['Needs consistent supply of both sludge and organic waste', 'Odour management required during active composting', 'Compost quality control needed for agriculture markets', '3–4 month cycle time limits throughput scaling'],
    maintenanceLevel: 'Medium',
    costLevel: 'High',
    relatedHazards: ['Heatwave', 'Drought'],
    typology: ['Desert / Arid', 'Plains / Alluvial'],
    matrixCategory: 'Liquid Waste — FSSM',
    matrixContext: 'Optimal in hot arid zones; covered shed required for cyclone and flood zones; thermophilic process benefits from heat',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'recommended', 'Cyclone': 'conditional', 'Cold Wave': 'not_suitable' },
  },

  'planted-drying-bed': {
    slug: 'planted-drying-bed',
    title: 'Planted Drying Bed (PDB)',
    category: 'waste',
    description: 'Nature-based faecal sludge dewatering system where sludge is spread on a gravel bed planted with emergent macrophytes (reed/Phragmites). Plants enhance drainage and evapotranspiration, drying and stabilising sludge over 2–3 year cycles. Capacity: 1–20 m³/day. Indian case studies: CDD India; Leh pilot project; FSM Alliance documented cases.',
    climateResilience: 'High — raised bed construction resists flooding. Heatwave conditions accelerate evapotranspiration and drying. Plant roots remain active even in moderate drought. Most vulnerable during extended monsoon periods when drying rate slows significantly.',
    suitableConditions: [
      'Tropical and sub-tropical zones with warm drying seasons',
      'Urban local bodies managing faecal sludge at household or cluster scale',
      'Capacity range: 1–20 m³ of sludge per day',
      'Sites with available land for long-term sludge beds',
      'Reuse: dried sludge cake for soil amendment; reed biomass as fuel/craft material',
    ],
    advantages: ['Nature-based with zero energy', 'Self-draining — plants enhance dewatering by 3–5× vs unplanted', 'Pathogen reduction: 2–3 log10 over 2-year cycle', 'Aesthetic; community acceptance higher than open beds', 'Sludge and reed biomass both reusable'],
    limitations: ['Large land requirement for volume-limited sites', '2–3 year cycle for sludge removal limits throughput', 'Plant maintenance needed; monsoon slows drying rate', 'Cyclone wind can damage above-ground reed plants'],
    maintenanceLevel: 'Low',
    costLevel: 'High',
    relatedHazards: ['Heatwave'],
    typology: ['Plains / Alluvial', 'Rain Intensive'],
    matrixCategory: 'Liquid Waste — FSSM Dewatering',
    matrixContext: 'Raise beds above flood line; thrives in tropical zones; monsoon extension reduces drying efficiency',
    hazardSuitability: { 'Flood': 'conditional', 'Heatwave': 'recommended', 'Drought': 'conditional', 'Cyclone': 'conditional', 'Cold Wave': 'not_suitable' },
  },

  'unplanted-drying-bed-solar': {
    slug: 'unplanted-drying-bed-solar',
    title: 'Unplanted Solar Drying Bed',
    category: 'waste',
    description: 'Open gravel or sand bed where faecal sludge is spread and solar heat and wind evaporate moisture, reducing volume by 70–80%. The simplest FSSM dewatering technology. Optimal in hot sunny climates. Capacity: 1–50 m³/day. Indian case studies: Widespread across India; SBM-U FSSM installations; NIUA documentation.',
    climateResilience: 'Medium — very high effectiveness in hot arid climates where intense solar radiation rapidly dries sludge. Open beds are flood-prone and wind-disperses dried sludge in cyclone events. Performance drops severely during monsoon months (closed or roofed design improves this).',
    suitableConditions: [
      'Hot arid and semi-arid zones with intense solar radiation',
      'Urban local bodies with faecal sludge service delivery',
      'Capacity range: 1–50 m³/day of faecal sludge',
      'Sites with large open land available (5–15 m² per m³/day)',
      'Reuse: dried sludge cake for land application or safe disposal',
    ],
    advantages: ['Simplest FSSM technology — lowest cost', 'Zero energy; solar heat does all drying work', 'Very effective in hot arid zones: drying in 1–3 weeks', 'Minimal skills needed for operation', 'Pathogen reduction: 2–3 log10 (enhanced in UV-intense zones)'],
    limitations: ['Very large land requirement (largest of FSSM options)', 'Open bed: flooding overwhelms beds in wet season', 'Wind disperses dried sludge in cyclone events', 'Odour issues; performance drops severely in monsoon'],
    maintenanceLevel: 'Low',
    costLevel: 'High',
    relatedHazards: ['Heatwave'],
    typology: ['Desert / Arid'],
    matrixCategory: 'Liquid Waste — FSSM Dewatering',
    matrixContext: 'Best in hot arid zones; add roof cover for monsoon resilience; avoid in flood-prone and cyclone-exposed sites',
    hazardSuitability: { 'Flood': 'not_suitable', 'Heatwave': 'recommended', 'Drought': 'conditional', 'Cyclone': 'not_suitable', 'Cold Wave': 'not_suitable' },
  },

  'dewats-full-train': {
    slug: 'dewats-full-train',
    title: 'DEWATS — Full Treatment Train',
    category: 'waste',
    description: 'Integrated Decentralised Wastewater Treatment System combining Settler + Anaerobic Baffled Reactor + Anaerobic Filter + Constructed Wetland. Fully gravity-driven with zero energy input. CPCB-compliant effluent for irrigation reuse. The gold standard for community-scale liquid waste management in India. Capacity: 5–500 KLD. Indian case studies: CDD India 450+ installations; BORDA; CSE documentation; ADB case studies.',
    climateResilience: 'Very High — engineered combination of underground anaerobic stages and surface constructed wetland. Underground components (Settler, ABR, AF) are protected from all hazards. Constructed wetland component needs berm protection in flood zones. Zero energy means climate resilience is not dependent on grid power.',
    suitableConditions: [
      'All climate zones — component selection varies by zone',
      'Community, institutional, and peri-urban scale (5–500 KLD)',
      'Settings requiring CPCB-compliant effluent for reuse',
      'Sites with skilled community management capacity',
      'Reuse: treated water for irrigation; sludge for compost',
    ],
    advantages: ['Complete treatment train — meets CPCB standards', 'Zero energy; fully gravity-driven', 'Modular — each component can be sized independently', 'Climate-adaptable: anaerobic stages work in all climates', 'Proven at scale: 450+ CDD India installations across 20 states'],
    limitations: ['Higher initial capital than single-stage systems', 'Requires trained design engineer for site-specific sizing', 'Community management essential for sustainability', 'Land needed for constructed wetland component'],
    maintenanceLevel: 'Medium',
    costLevel: 'Medium',
    relatedHazards: ['Flood', 'Heatwave', 'Drought', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Integrated System',
    matrixContext: 'Universal; underground anaerobic stages highly climate-resilient; raise CW berms in flood zones; select reed species by climate zone',
    hazardSuitability: { 'Flood': 'recommended', 'Heatwave': 'recommended', 'Drought': 'recommended', 'Cyclone': 'recommended', 'Cold Wave': 'recommended', 'Dust Storm': 'recommended' },
  },

  'johkasou': {
    slug: 'johkasou',
    title: 'Johkasou (Packaged Household DEWATS)',
    category: 'waste',
    description: 'Japanese-origin compact packaged household wastewater treatment unit combining primary sedimentation, biological treatment (biofilm + aeration), and disinfection in a single buried FRP tank. Produces reuse-grade effluent. Capacity: 0.5–10 KLD per household. Indian case studies: Japanese technology; pilot installations by JICA in India; SuSanA documentation.',
    climateResilience: 'Medium — buried FRP tank provides flood and cyclone resilience. Low-power blower may overheat in extreme heatwave. Requires consistent water supply for flushing — drought-sensitive. Factory-made quality control but maintenance culture needed for India context.',
    suitableConditions: [
      'All climate zones with electricity access',
      'Household and small cluster scale (0.5–10 KLD)',
      'Urban and peri-urban areas with electricity supply',
      'Green building and eco-housing schemes',
      'Reuse: reuse-grade effluent for garden and toilet flushing',
    ],
    advantages: ['Household-scale complete treatment in one buried unit', 'Factory-made quality control; quick installation', 'Buried FRP tank resists floods and cyclones', 'Compact footprint: 0.5–1.5 m²/KLD', 'BOD removal: 85–95%; pathogen reduction: 2–3 log'],
    limitations: ['Requires electricity for blower (10–50W constant)', 'FRP tank manufacturing cost adds to capital', 'Not yet widely manufactured in India — import or custom fabrication', 'Maintenance culture and service contracts needed'],
    maintenanceLevel: 'Medium',
    costLevel: 'High',
    relatedHazards: ['Flood', 'Cyclone'],
    typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly', 'Coastal', 'Rain Intensive', 'Flood Prone'],
    matrixCategory: 'Liquid Waste — Integrated System',
    matrixContext: 'Buried FRP tank climate-resilient for flood/cyclone; needs electricity — not suitable for off-grid settings; all climate zones with power supply',
    hazardSuitability: { 'Flood': 'recommended', 'Heatwave': 'conditional', 'Drought': 'conditional', 'Cyclone': 'recommended', 'Cold Wave': 'conditional' },
  },
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

// Hazards from the WASH Technology Climate Matrix (for TechnologyPage filter)
export const MATRIX_HAZARDS = [
  'Flood', 'Flash Flood', 'Drought', 'Cyclone', 'Heatwave',
  'Cold Wave', 'Waterlogging', 'Coastal Flooding', 'Earthquake',
  'Post-Disaster', 'Rocky Terrain', 'Urban Dense'
] as const;
export type MatrixHazard = typeof MATRIX_HAZARDS[number];

export const MATRIX_HAZARD_ICONS: Record<string, string> = {
  'Flood': '🌊',
  'Flash Flood': '⚡',
  'Drought': '☀️',
  'Cyclone': '🌀',
  'Heatwave': '🌡️',
  'Cold Wave': '❄️',
  'Waterlogging': '💧',
  'Coastal Flooding': '🏖️',
  'Earthquake': '🪨',
  'Post-Disaster': '🆘',
  'Rocky Terrain': '⛰️',
  'Urban Dense': '🏙️',
};

export const MATRIX_HAZARD_COLORS: Record<string, string> = {
  'Flood': '#3b82f6',
  'Flash Flood': '#1d4ed8',
  'Drought': '#f97316',
  'Cyclone': '#a855f7',
  'Heatwave': '#ef4444',
  'Cold Wave': '#06b6d4',
  'Waterlogging': '#60a5fa',
  'Coastal Flooding': '#0284c7',
  'Earthquake': '#78716c',
  'Post-Disaster': '#dc2626',
  'Rocky Terrain': '#92400e',
  'Urban Dense': '#475569',
};

export function getTechnologiesByHazardSuitability(hazard: string, rating: HazardSuitability): TechnologyInfo[] {
  return Object.values(technologyContent).filter(
    t => t.hazardSuitability && t.hazardSuitability[hazard] === rating
  );
}

export const technologyNameToSlug: Record<string, string> = {
  'Twin Pit': 'twin-pit',
  'Twin-Pit': 'twin-pit',
  'twin pit': 'twin-pit',
  'Elevated Twin Pit': 'twin-pit',
  'ETP': 'twin-pit',
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
  'VIP': 'vip',
  'Ventilated Improved Pit': 'vip',
  'Bio-Digester': 'bio-digester',
  'bio digester': 'bio-digester',
  'Constructed Wetland': 'constructed-wetland',
  'CW': 'constructed-wetland',
  'Composting': 'composting-dry',
  'composting toilet': 'composting-dry',
  'UDDT': 'uddt',
  'Urine Diverting': 'uddt',
  'Arborloo': 'arborloo',
  'arborloo': 'arborloo',
  'CBS': 'cbs',
  'Container-Based': 'cbs',
  'Skyloo': 'skyloo',
  'skyloo': 'skyloo',
  'Emergency Latrine': 'emergency-latrine',
  'Trench': 'emergency-latrine',
  'Sewered': 'sewered-flush',
  'sewered flush': 'sewered-flush',
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
