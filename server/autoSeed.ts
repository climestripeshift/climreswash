import { db } from "./db";
import { countries, states, districts, aqiObservations, technologies, users } from "@shared/schema";
import { getAqiCategory } from "./earlyWarning";
import { count, isNull, eq, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";

const TECH_SEED_DATA = [
  { id: 'twin-pit', slug: 'twin-pit', title: 'Twin Pit Toilet', category: 'sanitation', description: 'Twin pit toilets consist of two alternating pits that allow safe decomposition of human waste. When one pit fills up, it is sealed and the other pit is used. After 1-2 years, the sealed pit contents are safely composted and can be removed.', climateResilience: 'Moderate resilience to climate extremes. Works well in areas with variable rainfall but may be vulnerable in high water table or flood-prone regions. Requires careful siting in areas with seasonal flooding.', suitableConditions: ['Areas with stable soil conditions', 'Regions with low to medium water table', 'Rural and peri-urban settings', 'Areas with space for two pits'], advantages: ['Low cost and simple construction', 'No water required for operation', 'Produces safe, reusable compost', 'Minimal maintenance between pit switches', 'Long operational life (15-20 years)'], limitations: ['Not suitable for high water table areas', 'Requires space for two pits', 'May require desludging after 10+ years', 'Vulnerable to flooding if not elevated'], maintenanceLevel: 'Low', costLevel: 'Low', relatedHazards: ['Flood', 'Drought'], typology: ['Plains / Alluvial', 'Desert / Arid', 'Rocky / Hilly'] },
  { id: 'septic-tank', slug: 'septic-tank', title: 'Septic Tank System', category: 'sanitation', description: 'Septic tanks are underground chambers that treat domestic wastewater through biological decomposition and drainage. They provide primary treatment before effluent is dispersed into a drain field or further treated.', climateResilience: 'Good resilience when properly designed. Underground placement protects from temperature extremes. However, requires careful management in flood-prone areas and regular desludging in all conditions.', suitableConditions: ['Areas with adequate land for drain fields', 'Regions with permeable soils', 'Locations with access to desludging services', 'Urban and peri-urban settings'], advantages: ['Handles large volumes of wastewater', 'Underground placement protects from weather', 'Suitable for multiple households', 'Well-established technology with clear standards'], limitations: ['Requires regular desludging (every 3-5 years)', 'Higher construction cost than pit systems', 'Needs proper drainage field', 'Risk of groundwater contamination if poorly designed'], maintenanceLevel: 'Medium', costLevel: 'Medium', relatedHazards: ['Flood', 'Drought', 'Groundwater Depletion'], typology: ['Plains / Alluvial', 'Coastal', 'Rain Intensive'] },
  { id: 'soak-pit', slug: 'soak-pit', title: 'Soak Pit / Leach Pit', category: 'sanitation', description: 'A soak pit is a covered, porous-walled chamber that allows wastewater to slowly seep into surrounding soil. Used primarily for greywater disposal in semi-arid and arid regions with good soil permeability.', climateResilience: 'Well-adapted to low-rainfall environments where soil has high permeability. Poor performance in flooded or saturated conditions. Ideal for hot, dry climates with sandy or loamy soils.', suitableConditions: ['Semi-arid and arid regions', 'Areas with sandy or loamy permeable soils', 'Low rainfall and low water table areas', 'Rural homesteads and small institutions'], advantages: ['Very low cost and simple to construct', 'No water supply needed', 'Effective in dry climates', 'Easy to build with local materials'], limitations: ['Not suitable for clay soils or rocky terrain', 'Fails in high rainfall or flood conditions', 'Risk of groundwater contamination', 'Short lifespan in heavy-use settings'], maintenanceLevel: 'Low', costLevel: 'Low', relatedHazards: ['Drought', 'Dust Storm', 'Heatwave'], typology: ['Desert / Arid', 'Plains / Alluvial'] },
  { id: 'dewats', slug: 'dewats', title: 'DEWATS (Decentralized Wastewater Treatment)', category: 'waste', description: 'DEWATS is a modular, decentralized approach to wastewater treatment combining settling tanks, anaerobic baffled reactors, anaerobic filters, and constructed wetlands. It treats both black and grey water to safe discharge or reuse standards.', climateResilience: 'High resilience due to modular design and natural treatment processes. Constructed wetlands provide buffer against variable flows. Anaerobic processes work efficiently across temperature ranges with minimal energy input.', suitableConditions: ['Communities of 50-5000 households', 'Areas without centralized sewerage', 'Institutions (schools, hospitals, hotels)', 'Climate-stressed regions needing water reuse'], advantages: ['No electricity required for operation', 'Low operating costs after construction', 'Produces biogas for energy', 'Treated water can be reused for irrigation', 'Scalable and modular design'], limitations: ['Higher initial capital cost', 'Requires land for constructed wetlands', 'Needs trained operators for monitoring', 'Takes 3-6 months to reach full efficiency'], maintenanceLevel: 'Medium', costLevel: 'High', relatedHazards: ['Drought', 'Heatwave'], typology: ['Plains / Alluvial', 'Rain Intensive', 'Coastal'] },
  { id: 'solid-waste', slug: 'solid-waste', title: 'Climate-Resilient Solid Waste Management', category: 'waste', description: 'Climate-resilient solid waste management integrates waste segregation, composting, recycling, and safe disposal practices designed to withstand climate extremes like heavy rainfall, flooding, and heat stress.', climateResilience: 'Resilience depends on infrastructure design. Elevated collection points, covered composting facilities, and flood-proofed landfills are essential in climate-vulnerable areas.', suitableConditions: ['All settlement types (urban, peri-urban, rural)', 'Areas with community participation capacity', 'Regions with market for recyclables', 'Climate-stressed areas needing decentralized solutions'], advantages: ['Reduces disease vectors during extreme weather', 'Creates local employment and recycling markets', 'Produces compost for agriculture', 'Reduces methane emissions from landfills', 'Flexible and scalable approach'], limitations: ['Requires consistent community engagement', 'Infrastructure vulnerable to flooding if not elevated', 'Composting affected by extreme heat or cold', 'Needs separate handling of hazardous waste'], maintenanceLevel: 'Medium', costLevel: 'Medium', relatedHazards: ['Flood', 'Heatwave', 'Cyclone'], typology: ['Plains / Alluvial', 'Coastal', 'Rain Intensive'] },
  { id: 'rainwater-harvesting', slug: 'rainwater-harvesting', title: 'Rainwater Harvesting Systems', category: 'water', description: 'Rainwater harvesting captures and stores rainfall for drinking, domestic use, or groundwater recharge. Systems range from simple rooftop collection to community-scale storage tanks and recharge wells.', climateResilience: 'Highly climate-adaptive technology that converts rainfall variability into a resource. Provides water security during dry periods when designed with adequate storage. Reduces flood risk through managed infiltration.', suitableConditions: ['Areas with distinct wet and dry seasons', 'Regions with declining groundwater', 'Urban areas with rooftop collection potential', 'Water-stressed rural communities'], advantages: ['Reduces dependence on groundwater', 'Low operational cost after installation', 'Improves water security in drought periods', 'Recharges local aquifers', 'Reduces urban flooding'], limitations: ['Storage capacity limits dry-season supply', 'Requires roof and catchment maintenance', 'Quality depends on catchment cleanliness', 'Initial installation cost can be high'], maintenanceLevel: 'Low', costLevel: 'Medium', relatedHazards: ['Drought', 'Groundwater Depletion'], typology: ['Rain Intensive', 'Plains / Alluvial', 'Rocky / Hilly'] },
  { id: 'bore-well', slug: 'bore-well', title: 'Bore Well with Hand Pump', category: 'water', description: 'Bore wells access deep groundwater through drilled shafts fitted with hand pumps or motorized pumps. They provide reliable water supply in areas where surface water is scarce or contaminated.', climateResilience: 'Reliable during drought and dry spells if groundwater levels are stable. Vulnerable to aquifer depletion in regions with overextraction. Deep bore wells (>100m) are more resilient to seasonal variability.', suitableConditions: ['Areas with stable deep aquifers', 'Drought-prone and semi-arid regions', 'Remote rural communities', 'Rocky and hard-soil terrain'], advantages: ['Reliable water source independent of rainfall', 'Suitable for remote areas', 'Long lifespan with proper maintenance', 'Can serve multiple households'], limitations: ['High drilling cost in hard rock areas', 'Groundwater depletion risk with overuse', 'Requires electricity for motorized pumps', 'Risk of fluoride or arsenic contamination'], maintenanceLevel: 'Medium', costLevel: 'Medium', relatedHazards: ['Drought', 'Groundwater Depletion', 'Heatwave'], typology: ['Desert / Arid', 'Rocky / Hilly', 'Plains / Alluvial'] },
  { id: 'flood-resilient-sanitation', slug: 'flood-resilient-sanitation', title: 'Flood-Resilient Elevated Sanitation', category: 'sanitation', description: 'Elevated or flood-adapted sanitation systems including raised latrines, sealed superstructures, waterproof chambers, and container-based systems designed to remain functional during flood events.', climateResilience: 'Specifically engineered for flood resilience. Raised structure prevents inundation of pits and chambers. Sealed design prevents fecal contamination of floodwaters — critical for disease prevention during and after floods.', suitableConditions: ['Flood plains and river delta regions', 'Coastal and low-lying areas', 'Areas with annual monsoon flooding', 'Communities with cyclone risk'], advantages: ['Operational during flood events', 'Prevents fecal-oral disease outbreaks', 'Protects groundwater quality during floods', 'Durable against strong currents when anchored'], limitations: ['Higher construction cost than standard pit', 'Requires site-specific engineering', 'Container-based systems need frequent emptying', 'Community acceptance can be challenging'], maintenanceLevel: 'Medium', costLevel: 'High', relatedHazards: ['Flood', 'Cyclone'], typology: ['Flood Prone', 'Coastal', 'Rain Intensive'] },
  { id: 'solar-water-pump', slug: 'solar-water-pump', title: 'Solar-Powered Water Pump', category: 'water', description: 'Solar pumps use photovoltaic panels to power water extraction from wells, bore holes, or surface water sources. They provide reliable, off-grid water supply for drinking and irrigation with zero fuel cost after installation.', climateResilience: 'Excellent resilience in sunny, arid regions. Not dependent on grid electricity, making them functional during flood-related power outages. High irradiance in desert regions maximizes efficiency.', suitableConditions: ['Sunny, arid and semi-arid regions', 'Off-grid remote communities', 'Areas with frequent power outages', 'Irrigation-dependent farming communities'], advantages: ['Zero fuel cost after installation', 'Functions during power outages and disasters', 'Long lifespan (20-25 years for panels)', 'Low carbon footprint', 'Scalable from household to community level'], limitations: ['High upfront capital cost', 'Performance drops in cloudy/dusty conditions', 'Requires technical expertise for maintenance', 'Battery backup needed for night/cloudy use'], maintenanceLevel: 'Low', costLevel: 'High', relatedHazards: ['Drought', 'Heatwave', 'Dust Storm'], typology: ['Desert / Arid', 'Plains / Alluvial', 'Rocky / Hilly'] },
  { id: 'watershed-management', slug: 'watershed-management', title: 'Watershed Management & Check Dams', category: 'adaptation', description: 'Watershed management uses a combination of check dams, contour bunding, farm ponds, and vegetation restoration to manage water flow, reduce erosion, and recharge groundwater across a catchment area.', climateResilience: 'Highly resilient nature-based solution. Reduces both flood peaks and drought severity by regulating water flow. Effective against soil erosion during heavy rainfall. Improves groundwater recharge for drought resilience.', suitableConditions: ['Hilly and undulating terrain', 'Watersheds with degraded vegetation', 'Rain-shadow and drought-prone regions', 'Areas with soil erosion problems'], advantages: ['Addresses both flood and drought simultaneously', 'Low-cost with high community co-benefit', 'Improves groundwater recharge', 'Reduces soil erosion and sedimentation', 'Enhances local biodiversity'], limitations: ['Requires community ownership and governance', 'Benefits accrue over 3-5 year timescale', 'Needs technical survey for optimal siting', 'May alter downstream water flows'], maintenanceLevel: 'Low', costLevel: 'Medium', relatedHazards: ['Drought', 'Flood', 'Groundwater Depletion'], typology: ['Rocky / Hilly', 'Desert / Arid', 'Plains / Alluvial'] },
  { id: 'early-warning-system', slug: 'early-warning-system', title: 'Community Early Warning Systems', category: 'adaptation', description: 'Community-based early warning systems for climate hazards integrate meteorological data, local sensors, community networks, and mobile alerts to provide 24-72 hour advance warning for heatwaves, floods, cyclones, and air quality events.', climateResilience: 'Universal climate resilience tool applicable to all hazard types. Shifts response from reactive to proactive, enabling pre-positioning of WASH supplies, evacuation of vulnerable populations, and health system preparedness.', suitableConditions: ['All climate hazard contexts', 'Communities with mobile phone penetration', 'Areas with recurring seasonal hazards', 'Flood plains, cyclone coasts, and heat-stressed urban areas'], advantages: ['Works for all hazard types (flood, heat, cyclone)', 'Reduces mortality and morbidity significantly', 'Enables pre-positioning of water and hygiene supplies', 'Empowers community self-protection', '10:1 cost-benefit ratio documented by WMO'], limitations: ['Requires sustained institutional coordination', 'Effectiveness depends on last-mile communication', 'Alert fatigue can reduce community response', 'Needs regular testing and updating'], maintenanceLevel: 'Medium', costLevel: 'Medium', relatedHazards: ['Flood', 'Heatwave', 'Cyclone', 'Cold Wave', 'Dust Storm', 'Drought'], typology: ['Flood Prone', 'Coastal', 'Desert / Arid', 'Plains / Alluvial', 'Rocky / Hilly', 'Rain Intensive'] },
  { id: 'drought-resistant-crops', slug: 'drought-resistant-crops', title: 'Drought-Resistant Crops & WASH Integration', category: 'adaptation', description: 'Integration of drought-tolerant crop varieties with water-efficient WASH practices reduces household water demand during dry spells. Includes drip irrigation for handwashing stations, greywater reuse for kitchen gardens, and nutrition-WASH linkages.', climateResilience: 'Directly addresses drought vulnerability by reducing water dependency in food production. Greywater reuse extends scarce water resources. Improves nutrition outcomes which are climate-sensitive indicators for children.', suitableConditions: ['Drought-prone and semi-arid regions', 'Agricultural communities', 'Areas with seasonal water stress', 'Communities with child malnutrition burden'], advantages: ['Reduces food and water insecurity simultaneously', 'Improves child nutrition outcomes', 'Low-cost greywater reuse', 'Builds community resilience to climate shocks', 'Compatible with existing farming practices'], limitations: ['Requires behavior change and training', 'Depends on seed availability and extension services', 'Greywater reuse needs hygiene management', 'Benefits vary with soil type and agro-climate zone'], maintenanceLevel: 'Low', costLevel: 'Low', relatedHazards: ['Drought', 'Heatwave', 'Groundwater Depletion'], typology: ['Desert / Arid', 'Plains / Alluvial', 'Rocky / Hilly'] },
];

const climateRisksPool = ["Drought", "Flood", "Heatwave", "Cyclone", "Cold Wave", "Dust Storm", "Groundwater Depletion"];
const adaptationStrategiesPool = ["Rainwater Harvesting", "Solar Energy", "Drought-resistant Crops", "Early Warning Systems", "Watershed Management"];
const soilTypes = ["Sandy", "Alluvial", "Black Cotton", "Red Laterite", "Loamy", "Clay"];
const rockTypes = ["Sandstone", "Granite", "Basalt", "Limestone", "Shale"];
const toiletTypes = ["Septic Tank", "Soak Pit", "Twin Pit", "Single Pit"];
const waterStrategies = ["Bore Well", "Hand Pump", "Piped Water", "Open Well", "Tanker"];

function randomFromArray<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getCategory(score: number): string {
  if (score >= 0.8) return "Very High";
  if (score >= 0.6) return "High";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

function generateSeasonalData(vulnScore: number) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hazards = ["Cold Wave", "None", "Dust Storm", "Heatwave", "Heatwave", "Heatwave", "Flood", "Flood", "Flood", "Cyclone", "None", "Cold Wave"];
  return months.map((month, i) => ({
    month,
    hazard: hazards[i],
    hazardIntensity: Math.round(30 + Math.random() * 60 * vulnScore),
    impactMetric: "Dropout Rate",
    impactValue: Math.round(5 + Math.random() * 15),
    description: hazards[i] === "None" ? "Normal conditions" : `${hazards[i]} risk period`
  }));
}

function generateAqiObservations(districtId: string) {
  const baseAqi = 60 + Math.random() * 80;
  const observations = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const observedAt = new Date(now);
    observedAt.setDate(observedAt.getDate() - i);
    observedAt.setHours(12, 0, 0, 0);
    const aqiValue = Math.max(20, Math.min(400, Math.round(baseAqi + (Math.random() - 0.5) * 30)));
    const aqiInfo = getAqiCategory(aqiValue);
    observations.push({
      id: `aqi-${districtId}-${observedAt.toISOString().split('T')[0]}-${Math.random().toString(36).substring(2, 8)}`,
      districtId,
      aqiValue,
      aqiCategory: aqiInfo.category,
      pm25: Math.round(aqiValue * 0.4 + Math.random() * 20),
      pm10: Math.round(aqiValue * 0.8 + Math.random() * 30),
      no2: Math.round(20 + Math.random() * 40),
      so2: Math.round(10 + Math.random() * 20),
      co: Math.round((1 + Math.random() * 2) * 10) / 10,
      o3: Math.round(30 + Math.random() * 40),
      dominantPollutant: 'PM2.5',
      healthAdvisory: aqiInfo.healthAdvisory,
      observedAt
    });
  }
  return observations;
}

function findDataFile(filename: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'dist', 'public', 'data', filename),
    path.join(cwd, 'client', 'public', 'data', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findGeoJsonPath(): string | null {
  return findDataFile('india.json');
}

async function seedMultiCountryDataIfMissing(): Promise<void> {
  try {
    const countriesPath = findDataFile('countries_seed.json');
    const districtsPath = findDataFile('districts_seed.json');
    if (!countriesPath || !districtsPath) {
      console.log("[autoSeed] Multi-country seed files not found — skipping.");
      return;
    }
    const countryCount = await db.select({ value: count() }).from(countries).then(r => Number(r[0]?.value ?? 0));
    if (countryCount >= 14) {
      console.log(`[autoSeed] Multi-country data already present (${countryCount} countries) — skipping.`);
      return;
    }
    console.log(`[autoSeed] Only ${countryCount} countries in DB — importing multi-country seed data...`);

    const countryRows: any[] = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));
    for (const c of countryRows) {
      await db.insert(countries).values({
        id: c.id,
        name: c.name,
        population: c.population,
        totalStates: c.total_states,
        totalDistricts: c.total_districts,
      }).onConflictDoNothing();
      await db.insert(states).values({
        id: c.id,
        countryId: c.id,
        name: c.name,
        code: c.id,
        population: c.population,
        totalDistricts: c.total_districts,
        topClimateRisks: ["Flood", "Drought", "Heatwave"],
      }).onConflictDoNothing();
    }
    console.log(`[autoSeed] ✅ Imported ${countryRows.length} countries.`);

    const districtRows: any[] = JSON.parse(fs.readFileSync(districtsPath, 'utf-8'));
    const CHUNK = 50;
    let imported = 0;
    for (let i = 0; i < districtRows.length; i += CHUNK) {
      const chunk = districtRows.slice(i, i + CHUNK).map((d: any) => ({
        id: d.id,
        countryId: d.country_id,
        stateId: d.state_id,
        name: d.name,
        population: d.population,
        vulnerabilityScore: d.vulnerability_score,
        adaptationScore: d.adaptation_score,
        hazardScore: d.hazard_score,
        hazardCategory: d.hazard_category,
        exposureScore: d.exposure_score,
        exposureCategory: d.exposure_category,
        vulnerabilityCategory: d.vulnerability_category,
        riskScore: d.risk_score,
        riskCategory: d.risk_category,
        childrenAtRisk: d.children_at_risk,
        elderlyAtRisk: d.elderly_at_risk,
        climateRisks: d.climate_risks,
        adaptationStrategies: d.adaptation_strategies,
        impactIfNoAction: d.impact_if_no_action,
        soilType: d.soil_type,
        rockType: d.rock_type,
        toiletTechnology: d.toilet_technology,
        waterSupplyStrategy: d.water_supply_strategy,
        dropoutRate: d.dropout_rate,
        waterAccessPercent: d.water_access_percent,
        toiletCoveragePercent: d.toilet_coverage_percent,
        handwashingFacilityPercent: d.handwashing_facility_percent,
        schoolToiletPercent: d.school_toilet_percent,
        schoolWaterPercent: d.school_water_percent,
        anganwadiToiletPercent: d.anganwadi_toilet_percent,
        anganwadiWaterPercent: d.anganwadi_water_percent,
        childMarriageRate: d.child_marriage_rate,
        malnutritionStunting: d.malnutrition_stunting,
        malnutritionWasting: d.malnutrition_wasting,
        malnutritionUnderweight: d.malnutrition_underweight,
        infantMortalityRate: d.infant_mortality_rate,
        maternalMortalityRatio: d.maternal_mortality_ratio,
        geometry: d.geometry,
        seasonalData: generateSeasonalData(d.vulnerability_score ?? 0.4),
      }));
      await db.insert(districts).values(chunk).onConflictDoNothing();
      imported += chunk.length;
      if (imported % 200 === 0 || imported >= districtRows.length) {
        console.log(`[autoSeed] Multi-country districts: ${imported}/${districtRows.length} imported`);
      }
    }
    console.log(`[autoSeed] ✅ Multi-country seed complete — ${imported} districts imported.`);
  } catch (err) {
    console.error("[autoSeed] Multi-country seed failed:", err);
  }
}

async function seedIndiaGeometryIfMissing(features: Array<{ properties: { ID: string }; geometry: any }>): Promise<void> {
  try {
    const missingResult = await db.select({ value: count() }).from(districts)
      .where(sql`${districts.countryId} = 'IND' AND ${districts.geometry} IS NULL`);
    const missing = Number(missingResult[0]?.value ?? 0);
    if (missing === 0) {
      console.log("[autoSeed] India geometries already present — skipping geometry import.");
      return;
    }
    console.log(`[autoSeed] ${missing} India districts missing geometry — importing from india.json...`);
    let updated = 0;
    for (const feature of features) {
      if (!feature.geometry) continue;
      const id = String(feature.properties.ID);
      const geomStr = JSON.stringify(feature.geometry).replace(/'/g, "''");
      await db.execute(sql.raw(`UPDATE districts SET geometry = '${geomStr}'::jsonb, updated_at = NOW() WHERE id = '${id}' AND geometry IS NULL`));
      updated++;
    }
    console.log(`[autoSeed] ✅ India geometry import done — ${updated} districts updated.`);
  } catch (err) {
    console.error("[autoSeed] Geometry import failed:", err);
  }
}

export async function seedIfEmpty(): Promise<void> {
  try {
    const geoJsonPath = findGeoJsonPath();
    if (!geoJsonPath) {
      console.error("[autoSeed] Could not find india.json — cannot seed database.");
      return;
    }

    const geojson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf-8'));
    const features = geojson.features as Array<{ properties: { NAME: string; ID: string; HAZARD?: number; EXPOSURE?: number; VULNERABILITY?: number; RISK?: number; STATE?: string }; geometry: any }>;
    const expectedCount = features.length;

    const result = await db.select({ value: count() }).from(districts);
    const districtCount = result[0]?.value ?? 0;

    if (districtCount >= expectedCount) {
      console.log(`[autoSeed] Database already has ${districtCount}/${expectedCount} districts — skipping seed.`);
      // Still import geometry, multi-country data, and check technologies
      await seedIndiaGeometryIfMissing(features);
      await seedMultiCountryDataIfMissing();
      await seedTechnologiesIfEmpty();
      return;
    }

    console.log(`[autoSeed] Database has ${districtCount}/${expectedCount} districts — seeding missing rows from GeoJSON...`);
    console.log(`[autoSeed] Reading GeoJSON from: ${geoJsonPath}`);
    console.log(`[autoSeed] Found ${features.length} districts in GeoJSON`);

    await db.insert(countries).values({
      id: "IND",
      name: "India",
      population: 1400000000,
      totalStates: 36,
      totalDistricts: features.length,
    }).onConflictDoNothing();

    await db.insert(states).values({
      id: "ALL",
      countryId: "IND",
      name: "All States",
      code: "ALL",
      population: 1400000000,
      totalDistricts: features.length,
      topClimateRisks: ["Flood", "Drought", "Heatwave", "Cyclone", "Cold Wave"]
    }).onConflictDoNothing();

    const CHUNK = 100;

    // Build all district rows in memory
    const allDistricts = features.map(f => {
      const props = f.properties;
      const id = props.ID;
      const name = props.NAME;
      const hazard = props.HAZARD ?? Math.random() * 0.8;
      const exposure = props.EXPOSURE ?? Math.random() * 0.8;
      const vulnerability = props.VULNERABILITY ?? Math.random() * 0.8;
      const risk = props.RISK ?? Math.random() * 0.8;
      const population = Math.round(500000 + Math.random() * 3000000);
      return {
        id,
        stateId: "ALL",
        name,
        population,
        vulnerabilityScore: vulnerability,
        adaptationScore: Math.round(25 + Math.random() * 50),
        hazardScore: hazard,
        hazardCategory: getCategory(hazard),
        exposureScore: exposure,
        exposureCategory: getCategory(exposure),
        vulnerabilityCategory: getCategory(vulnerability),
        riskScore: risk,
        riskCategory: getCategory(risk),
        childrenAtRisk: Math.round(population * 0.12 * vulnerability),
        elderlyAtRisk: Math.round(population * 0.08 * vulnerability),
        climateRisks: randomFromArray(climateRisksPool, 3),
        adaptationStrategies: randomFromArray(adaptationStrategiesPool, 2),
        impactIfNoAction: `Risk level: ${getCategory(risk)}. Without intervention, ${name} faces significant climate challenges.`,
        soilType: soilTypes[Math.floor(Math.random() * soilTypes.length)],
        rockType: rockTypes[Math.floor(Math.random() * rockTypes.length)],
        toiletTechnology: toiletTypes[Math.floor(Math.random() * toiletTypes.length)],
        waterSupplyStrategy: waterStrategies[Math.floor(Math.random() * waterStrategies.length)],
        dropoutRate: Math.round(5 + Math.random() * 15),
        waterAccessPercent: Math.round(50 + Math.random() * 45),
        toiletCoveragePercent: Math.round(45 + Math.random() * 50),
        handwashingFacilityPercent: Math.round(30 + Math.random() * 50),
        childMarriageRate: Math.round(5 + Math.random() * 25),
        malnutritionStunting: Math.round(20 + Math.random() * 30),
        malnutritionWasting: Math.round(10 + Math.random() * 20),
        malnutritionUnderweight: Math.round(15 + Math.random() * 25),
        infantMortalityRate: Math.round(20 + Math.random() * 40),
        maternalMortalityRatio: Math.round(80 + Math.random() * 120),
        seasonalData: generateSeasonalData(vulnerability)
      };
    });

    // Bulk insert districts in chunks
    for (let i = 0; i < allDistricts.length; i += CHUNK) {
      const chunk = allDistricts.slice(i, i + CHUNK);
      await db.insert(districts).values(chunk).onConflictDoNothing();
      console.log(`[autoSeed] ✅ Districts ${i + 1}–${Math.min(i + CHUNK, allDistricts.length)}/${allDistricts.length} done`);
    }

    // Build all AQI rows in memory
    const allAqi = allDistricts.flatMap(d => generateAqiObservations(d.id));

    // Bulk insert AQI in chunks
    for (let i = 0; i < allAqi.length; i += CHUNK) {
      await db.insert(aqiObservations).values(allAqi.slice(i, i + CHUNK)).onConflictDoNothing();
    }
    console.log(`[autoSeed] ✅ AQI observations inserted (${allAqi.length} total)`);

    console.log(`[autoSeed] 🎉 Seeding complete! ${allDistricts.length} districts, ${allAqi.length} AQI records.`);
    await seedTechnologiesIfEmpty();
  } catch (error) {
    console.error("[autoSeed] Failed to seed database:", error);
  }
}

async function seedTechnologiesIfEmpty(): Promise<void> {
  try {
    const techCountResult = await db.select({ value: count() }).from(technologies);
    const techCount = techCountResult[0]?.value ?? 0;
    if (techCount === 0) {
      await db.insert(technologies).values(TECH_SEED_DATA.map(t => ({
        ...t,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))).onConflictDoNothing();
      console.log(`[autoSeed] ✅ Seeded ${TECH_SEED_DATA.length} technologies`);
    } else {
      console.log(`[autoSeed] Technologies already seeded (${techCount} records) — skipping.`);
    }
  } catch (e) {
    console.error("[autoSeed] Tech seeding failed:", e);
  }
  await seedAdminUserIfEmpty();
}

async function seedAdminUserIfEmpty(): Promise<void> {
  try {
    const userCountResult = await db.select({ value: count() }).from(users);
    const userCount = userCountResult[0]?.value ?? 0;
    if (userCount === 0) {
      const hashed = await bcrypt.hash("admin123", 10);
      await db.insert(users).values({
        username: "admin",
        password: hashed,
      }).onConflictDoNothing();
      console.log(`[autoSeed] ✅ Admin user created — username: admin, password: admin123`);
    } else {
      console.log(`[autoSeed] Admin user already exists — skipping.`);
    }
  } catch (e) {
    console.error("[autoSeed] Admin user seeding failed:", e);
  }
}
