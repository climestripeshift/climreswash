import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, timestamp, doublePrecision, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Geographic Hierarchy: Country → State → District → Block
export const countries = pgTable("countries", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  population: integer("population").notNull(),
  totalStates: integer("total_states").notNull().default(0),
  totalDistricts: integer("total_districts").notNull().default(0),
  avgVulnerabilityScore: real("avg_vulnerability_score").notNull().default(0),
  avgAdaptationScore: real("avg_adaptation_score").notNull().default(0),
  totalChildrenAtRisk: integer("total_children_at_risk").notNull().default(0),
  totalElderlyAtRisk: integer("total_elderly_at_risk").notNull().default(0),
  activeAlerts: integer("active_alerts").notNull().default(0),
  criticalDistricts: integer("critical_districts").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const states = pgTable("states", {
  id: varchar("id", { length: 50 }).primaryKey(),
  countryId: varchar("country_id", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  population: integer("population").notNull(),
  totalDistricts: integer("total_districts").notNull().default(0),
  totalBlocks: integer("total_blocks").notNull().default(0),
  avgVulnerabilityScore: real("avg_vulnerability_score").notNull().default(0),
  avgAdaptationScore: real("avg_adaptation_score").notNull().default(0),
  totalChildrenAtRisk: integer("total_children_at_risk").notNull().default(0),
  totalElderlyAtRisk: integer("total_elderly_at_risk").notNull().default(0),
  activeAlerts: integer("active_alerts").notNull().default(0),
  criticalDistricts: integer("critical_districts").notNull().default(0),
  topClimateRisks: text("top_climate_risks").array().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const districts = pgTable("districts", {
  id: varchar("id", { length: 100 }).primaryKey(),
  countryId: varchar("country_id", { length: 50 }).notNull().default('IND'),
  stateId: varchar("state_id", { length: 50 }).notNull().default('RJ'),
  name: varchar("name", { length: 255 }).notNull(),
  population: integer("population").notNull(),
  vulnerabilityScore: real("vulnerability_score").notNull(),
  adaptationScore: real("adaptation_score").notNull(),
  
  // Climate Risk Scores & Categories (from official data)
  // hazardScore: populated by fix:district-hazards (from india.json HAZARD field)
  hazardScore: real("hazard_score"),
  hazardCategory: varchar("hazard_category", { length: 50 }),
  exposureScore: real("exposure_score"),
  exposureCategory: varchar("exposure_category", { length: 50 }),
  // sensitivityScore: CVI Excel col 7 — set by importCVI (was previously discarded)
  // Distinct from vulnerabilityScore (composite CVI). Used in V = sensitivity × (1 - adaptiveCapacity).
  sensitivityScore: real("sensitivity_score"),
  vulnerabilityCategory: varchar("vulnerability_category", { length: 50 }),
  riskScore: real("risk_score"),
  riskCategory: varchar("risk_category", { length: 50 }),
  
  // Vulnerable Population
  childrenAtRisk: integer("children_at_risk").notNull(),
  elderlyAtRisk: integer("elderly_at_risk").notNull(),
  
  // Climate Risks & Strategies
  climateRisks: text("climate_risks").array().notNull(),
  adaptationStrategies: text("adaptation_strategies").array().notNull(),
  impactIfNoAction: text("impact_if_no_action").notNull(),

  // Per-hazard intensity scores (0–1 scale), editable in admin
  hazardIntensities: jsonb("hazard_intensities").$type<Record<string, number>>().default({}),
  
  // Infrastructure Indicators
  soilType: varchar("soil_type", { length: 100 }).notNull(),
  rockType: varchar("rock_type", { length: 100 }).notNull(),
  toiletTechnology: varchar("toilet_technology", { length: 150 }).notNull(),
  waterSupplyStrategy: varchar("water_supply_strategy", { length: 150 }).notNull(),
  dropoutRate: real("dropout_rate").notNull(),
  
  // WASH Indicators — Household
  waterAccessPercent: real("water_access_percent").notNull().default(0),
  toiletCoveragePercent: real("toilet_coverage_percent").notNull().default(0),
  handwashingFacilityPercent: real("handwashing_facility_percent").notNull().default(0),

  // WASH Indicators — Schools
  schoolToiletPercent: real("school_toilet_percent").default(0),
  schoolWaterPercent: real("school_water_percent").default(0),

  // WASH Indicators — Anganwadis (ICDS Centres)
  anganwadiToiletPercent: real("anganwadi_toilet_percent").default(0),
  anganwadiWaterPercent: real("anganwadi_water_percent").default(0),
  
  // Health & Social Indicators
  childMarriageRate: real("child_marriage_rate").notNull().default(0),
  malnutritionStunting: real("malnutrition_stunting").notNull().default(0),
  malnutritionWasting: real("malnutrition_wasting").notNull().default(0),
  malnutritionUnderweight: real("malnutrition_underweight").notNull().default(0),
  infantMortalityRate: real("infant_mortality_rate").notNull().default(0),
  maternalMortalityRatio: real("maternal_mortality_ratio").notNull().default(0),
  
  // Map boundary geometry (GeoJSON Polygon / MultiPolygon)
  geometry: jsonb("geometry").$type<{ type: string; coordinates: any[] }>(),

  // Seasonal Data (stored as JSONB for flexibility)
  seasonalData: jsonb("seasonal_data").notNull().$type<Array<{
    month: string;
    hazard: string;
    hazardIntensity: number;
    impactMetric: string;
    impactValue: number;
    description: string;
  }>>(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Blocks (sub-district level)
export const blocks = pgTable("blocks", {
  id: varchar("id", { length: 100 }).primaryKey(),
  districtId: varchar("district_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  population: integer("population").notNull(),
  vulnerabilityScore: real("vulnerability_score").notNull(),
  adaptationScore: real("adaptation_score").notNull(),
  childrenAtRisk: integer("children_at_risk").notNull(),
  elderlyAtRisk: integer("elderly_at_risk").notNull(),
  climateRisks: text("climate_risks").array().notNull(),
  adaptationStrategies: text("adaptation_strategies").array().notNull(),
  waterAccessPercent: real("water_access_percent").notNull().default(0),
  toiletCoveragePercent: real("toilet_coverage_percent").notNull().default(0),
  handwashingFacilityPercent: real("handwashing_facility_percent").notNull().default(0),
  malnutritionStunting: real("malnutrition_stunting").notNull().default(0),
  infantMortalityRate: real("infant_mortality_rate").notNull().default(0),
  activeAlerts: integer("active_alerts").notNull().default(0),
  gramPanchayats: integer("gram_panchayats").notNull().default(0),
  villages: integer("villages").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiIntegrations = pgTable("api_integrations", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'imd', 'groundwater', 'custom'
  isConnected: integer("is_connected").notNull().default(0), // 0 or 1 (boolean)
  lastSync: timestamp("last_sync"),
  endpoint: text("endpoint"),
  metadata: jsonb("metadata"),
});

// Early Warning Alerts
export const alerts = pgTable("alerts", {
  id: varchar("id", { length: 100 }).primaryKey(),
  districtId: varchar("district_id", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull(), // 'advisory', 'watch', 'warning', 'emergency'
  type: varchar("type", { length: 50 }).notNull(), // 'heatwave', 'flood', 'drought', 'air_quality', 'health'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  forecastMonth: varchar("forecast_month", { length: 20 }), // 'Dec 2025', 'Jan 2026' for timeline view
  riskScore: real("risk_score").notNull().default(0), // composite risk score 0-100
  impactedPopulation: integer("impacted_population").notNull(),
  recommendedActions: text("recommended_actions").array().notNull(),
  drivers: text("drivers").array().notNull(), // factors contributing to alert
  projectedImpact: text("projected_impact").notNull(),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Interventions for Action Planning
export const interventions = pgTable("interventions", {
  id: varchar("id", { length: 100 }).primaryKey(),
  alertId: varchar("alert_id", { length: 100 }).notNull(),
  districtId: varchar("district_id", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 20 }).notNull(), // 'critical', 'high', 'medium', 'low'
  category: varchar("category", { length: 50 }).notNull(), // 'health', 'infrastructure', 'water', 'shelter', 'food'
  assignedTo: varchar("assigned_to", { length: 100 }),
  assignedDepartment: varchar("assigned_department", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'cancelled'
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  resourcesRequired: text("resources_required"),
  estimatedCost: real("estimated_cost"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Community Reports (placeholder for engagement)
export const communityReports = pgTable("community_reports", {
  id: varchar("id", { length: 100 }).primaryKey(),
  districtId: varchar("district_id", { length: 100 }).notNull(),
  reportType: varchar("report_type", { length: 50 }).notNull(), // 'hazard_sighting', 'damage_report', 'resource_need', 'feedback'
  description: text("description").notNull(),
  location: varchar("location", { length: 255 }),
  reporterPhone: varchar("reporter_phone", { length: 20 }),
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'verified', 'addressed'
  severity: varchar("severity", { length: 20 }), // 'low', 'medium', 'high'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AQI Observations
export const aqiObservations = pgTable("aqi_observations", {
  id: varchar("id", { length: 100 }).primaryKey(),
  districtId: varchar("district_id", { length: 100 }).notNull(),
  aqiValue: integer("aqi_value").notNull(),
  aqiCategory: varchar("aqi_category", { length: 50 }).notNull(), // 'Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'
  pm25: real("pm25"),
  pm10: real("pm10"),
  no2: real("no2"),
  so2: real("so2"),
  co: real("co"),
  o3: real("o3"),
  dominantPollutant: varchar("dominant_pollutant", { length: 20 }),
  healthAdvisory: text("health_advisory"),
  respiratoryRiskMultiplier: real("respiratory_risk_multiplier").notNull().default(1),
  source: varchar("source", { length: 100 }).notNull().default('CPCB'),
  observedAt: timestamp("observed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Technologies Library
export const technologies = pgTable("technologies", {
  id: varchar("id", { length: 100 }).primaryKey(), // same as slug
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // sanitation | water | waste | adaptation
  description: text("description").notNull(),
  climateResilience: text("climate_resilience").notNull(),
  suitableConditions: text("suitable_conditions").array().notNull(),
  advantages: text("advantages").array().notNull(),
  limitations: text("limitations").array().notNull(),
  maintenanceLevel: varchar("maintenance_level", { length: 20 }).notNull(),
  costLevel: varchar("cost_level", { length: 20 }).notNull(),
  relatedHazards: text("related_hazards").array().notNull(),
  typology: text("typology").array().notNull(),
  // Admin-uploaded technical drawing (cross-section/schematic), see server routes.ts
  // POST /api/technologies/:id/diagram. Nullable -- most rows won't have one uploaded
  // yet. Path under /uploads/technology/, served directly by Express (not the Vite
  // build), so uploads persist across rebuilds.
  diagramUrl: varchar("diagram_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Country schemas
export const insertCountrySchema = createInsertSchema(countries).omit({
  updatedAt: true,
});

// State schemas
export const insertStateSchema = createInsertSchema(states).omit({
  updatedAt: true,
});

// District schemas
export const insertDistrictSchema = createInsertSchema(districts).omit({
  createdAt: true,
  updatedAt: true,
});

// Block schemas
export const insertBlockSchema = createInsertSchema(blocks).omit({
  createdAt: true,
  updatedAt: true,
});

// API Integration schemas
export const insertApiIntegrationSchema = createInsertSchema(apiIntegrations);

// Alert schemas
export const insertAlertSchema = createInsertSchema(alerts).omit({
  createdAt: true,
});

// AQI schemas
export const insertAqiObservationSchema = createInsertSchema(aqiObservations).omit({
  createdAt: true,
});

// Intervention schemas
export const insertInterventionSchema = createInsertSchema(interventions).omit({
  createdAt: true,
  updatedAt: true,
});

// Community Report schemas
export const insertCommunityReportSchema = createInsertSchema(communityReports).omit({
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Country = typeof countries.$inferSelect;
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type State = typeof states.$inferSelect;
export type InsertState = z.infer<typeof insertStateSchema>;
export type District = typeof districts.$inferSelect;
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type ApiIntegration = typeof apiIntegrations.$inferSelect;
export type InsertApiIntegration = z.infer<typeof insertApiIntegrationSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type AqiObservation = typeof aqiObservations.$inferSelect;
export type InsertAqiObservation = z.infer<typeof insertAqiObservationSchema>;
export type Intervention = typeof interventions.$inferSelect;
export type InsertIntervention = z.infer<typeof insertInterventionSchema>;
export type CommunityReport = typeof communityReports.$inferSelect;
export type InsertCommunityReport = z.infer<typeof insertCommunityReportSchema>;

// Technology schemas
export const insertTechnologySchema = createInsertSchema(technologies).omit({
  createdAt: true,
  updatedAt: true,
});
export type Technology = typeof technologies.$inferSelect;
export type InsertTechnology = z.infer<typeof insertTechnologySchema>;

// ── Stress-test / forward-looking projections ──────────────────────────────

// One row per (district, scenario, year, hazard) — the raw + normalised hazard exposure
export const hazardProjections = pgTable("hazard_projections", {
  districtId:  varchar("district_id", { length: 100 }).notNull(),
  scenario:    varchar("scenario", { length: 50 }).notNull(),
  // 'current_policies' | 'ndc' | 'net_zero_2050'
  horizonYear: integer("horizon_year").notNull(),
  // 2025 | 2030 | 2040 | 2050
  hazard:      varchar("hazard", { length: 20 }).notNull(),
  // 'heat' | 'drought' | 'flood'
  rawValue:    doublePrecision("raw_value").notNull(),
  normValue:   doublePrecision("norm_value"),      // [0,1] set after global normalisation pass
  modelSpread: doublePrecision("model_spread"),    // inter-model std dev (uncertainty band)
  cmip6Models: text("cmip6_models").array(),       // e.g. ['ACCESS-CM2','MPI-ESM1-2-HR',...]
  source:      text("source"),                     // dataset version + method note
  computedAt:  timestamp("computed_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.districtId, t.scenario, t.horizonYear, t.hazard] }),
}));

// One row per (district, scenario, year) — the composite vulnerability projection
export const vulnerabilityProjections = pgTable("vulnerability_projections", {
  districtId:        varchar("district_id", { length: 100 }).notNull(),
  scenario:          varchar("scenario", { length: 50 }).notNull(),
  horizonYear:       integer("horizon_year").notNull(),
  exposureComposite: doublePrecision("exposure_composite").notNull(),
  sensitivity:       doublePrecision("sensitivity").notNull(),   // frozen from current district data (v1)
  adaptiveCap:       doublePrecision("adaptive_cap").notNull(),  // frozen from current district data (v1)
  vulnerability:     doublePrecision("vulnerability").notNull(), // (exposure × sensitivity) / adaptiveCap
  deterioration:     doublePrecision("deterioration"),           // V(scenario,year) − V(baseline,2025)
  avoidedDamage:     doublePrecision("avoided_damage"),          // V(current_policies,2050) − V(net_zero,2050)
  // hazardWeights stores the weights used so every score is reproducible
  hazardWeights:     jsonb("hazard_weights").$type<Record<string, number>>(),
  // hazardBreakdown shows each hazard's share of the composite (for "why is this district bad" UI)
  hazardBreakdown:   jsonb("hazard_breakdown").$type<Record<string, number>>(),
  computedAt:        timestamp("computed_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.districtId, t.scenario, t.horizonYear] }),
}));

export const insertHazardProjectionSchema = createInsertSchema(hazardProjections).omit({ computedAt: true });
export const insertVulnerabilityProjectionSchema = createInsertSchema(vulnerabilityProjections).omit({ computedAt: true });
export type HazardProjection = typeof hazardProjections.$inferSelect;
export type InsertHazardProjection = z.infer<typeof insertHazardProjectionSchema>;
export type VulnerabilityProjection = typeof vulnerabilityProjections.$inferSelect;
export type InsertVulnerabilityProjection = z.infer<typeof insertVulnerabilityProjectionSchema>;

// ── Multi-hazard compound-risk model (Phase 1–5 upgrade) ──────────────────────

// Canonical hazard taxonomy — 8 hazard types used in the compound-risk model
export const hazardTaxonomy = pgTable("hazard_taxonomy", {
  id:             varchar("id", { length: 50 }).primaryKey(),  // 'heat', 'drought', 'flood_river', …
  name:           varchar("name", { length: 100 }).notNull(),
  shortCode:      varchar("short_code", { length: 10 }).notNull(),
  category:       varchar("category", { length: 50 }).notNull(),  // 'meteorological' | 'hydrological' | 'geomorphological'
  geographicScope: text("geographic_scope").array().notNull(),    // state names where hazard is primary
  description:    text("description").notNull(),
  dataSource:     text("data_source").notNull(),
  defaultWeight:  real("default_weight").notNull().default(0),    // weight in composite (must sum to 1)
  sortOrder:      integer("sort_order").notNull().default(0),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

// Hazard interaction matrix (Gill & Malamud 2014 qualitative codes)
// Rows where i=j (self-interaction) are not stored.
// qualitativeCode: -2 (strong inhibit) to +2 (strong trigger)
export const hazardInteractionMatrix = pgTable("hazard_interaction_matrix", {
  hazardIdI:       varchar("hazard_id_i", { length: 50 }).notNull(),
  hazardIdJ:       varchar("hazard_id_j", { length: 50 }).notNull(),
  interactionType: varchar("interaction_type", { length: 50 }),   // 'trigger' | 'increase' | 'inhibit' | 'independent'
  qualitativeCode: integer("qualitative_code").notNull(),          // -2 to +2
  strength:        real("strength"),                               // null until empirically calibrated
  notes:           text("notes"),
  source:          text("source"),
}, (t) => ({
  pk: primaryKey({ columns: [t.hazardIdI, t.hazardIdJ] }),
}));

// Multi-hazard composite projections — one row per (district, scenario, horizonYear)
// Produced by computeMultiHazardProjections(); augments, never replaces, vulnerabilityProjections.
export const multiHazardProjections = pgTable("multi_hazard_projections", {
  districtId:              varchar("district_id", { length: 100 }).notNull(),
  scenario:                varchar("scenario", { length: 50 }).notNull(),
  horizonYear:             integer("horizon_year").notNull(),
  perHazardRisk:           jsonb("per_hazard_risk").$type<Record<string, number>>().notNull(),
  compositeRisk:           doublePrecision("composite_risk").notNull(),
  interactionContribution: doublePrecision("interaction_contribution").notNull().default(0),
  dominantHazard:          varchar("dominant_hazard", { length: 50 }),
  aggregationMethod:       varchar("aggregation_method", { length: 80 }).notNull(),
  computedAt:              timestamp("computed_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.districtId, t.scenario, t.horizonYear] }),
}));

export const insertHazardTaxonomySchema = createInsertSchema(hazardTaxonomy).omit({ createdAt: true });
export const insertHazardInteractionSchema = createInsertSchema(hazardInteractionMatrix);
export const insertMultiHazardProjectionSchema = createInsertSchema(multiHazardProjections).omit({ computedAt: true });

export type HazardTaxonomy = typeof hazardTaxonomy.$inferSelect;
export type InsertHazardTaxonomy = z.infer<typeof insertHazardTaxonomySchema>;
export type HazardInteraction = typeof hazardInteractionMatrix.$inferSelect;
export type InsertHazardInteraction = z.infer<typeof insertHazardInteractionSchema>;
export type MultiHazardProjection = typeof multiHazardProjections.$inferSelect;
export type InsertMultiHazardProjection = z.infer<typeof insertMultiHazardProjectionSchema>;

// ── Adaptation Projections (Python climate-adapt-risk engine output) ──────────

export interface AdaptRecommendation {
  category: "WASH" | "DRR" | "Policy" | "Health";
  priority: "Critical" | "High" | "Medium" | "Low";
  action: string;
  rationale: string;
  indicator: string;
}

export const adaptProjections = pgTable("adapt_projections", {
  districtId:         varchar("district_id", { length: 100 }).primaryKey(),
  effectiveDrought:   doublePrecision("effective_drought").notNull(),
  effectiveFlood:     doublePrecision("effective_flood").notNull(),
  compoundHazard:     doublePrecision("compound_hazard").notNull(),
  hazardNorm:         doublePrecision("hazard_norm").notNull(),
  riskScore:          doublePrecision("risk_score").notNull(),
  impactPeople:       doublePrecision("impact_people").notNull(),
  impactLivelihood:   doublePrecision("impact_livelihood").notNull(),
  recommendations:    jsonb("recommendations").$type<AdaptRecommendation[]>().notNull().default([]),
  computedAt:         timestamp("computed_at").defaultNow().notNull(),
});

export const insertAdaptProjectionSchema = createInsertSchema(adaptProjections).omit({ computedAt: true });
export type AdaptProjection = typeof adaptProjections.$inferSelect;
export type InsertAdaptProjection = z.infer<typeof insertAdaptProjectionSchema>;
