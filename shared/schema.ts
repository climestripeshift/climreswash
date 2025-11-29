import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const districts = pgTable("districts", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  population: integer("population").notNull(),
  vulnerabilityScore: real("vulnerability_score").notNull(),
  adaptationScore: real("adaptation_score").notNull(),
  
  // Vulnerable Population
  childrenAtRisk: integer("children_at_risk").notNull(),
  elderlyAtRisk: integer("elderly_at_risk").notNull(),
  
  // Climate Risks & Strategies
  climateRisks: text("climate_risks").array().notNull(),
  adaptationStrategies: text("adaptation_strategies").array().notNull(),
  impactIfNoAction: text("impact_if_no_action").notNull(),
  
  // Infrastructure Indicators
  soilType: varchar("soil_type", { length: 100 }).notNull(),
  rockType: varchar("rock_type", { length: 100 }).notNull(),
  toiletTechnology: varchar("toilet_technology", { length: 150 }).notNull(),
  waterSupplyStrategy: varchar("water_supply_strategy", { length: 150 }).notNull(),
  dropoutRate: real("dropout_rate").notNull(),
  
  // WASH Indicators (Water, Sanitation, Hygiene)
  waterAccessPercent: real("water_access_percent").notNull().default(0),
  toiletCoveragePercent: real("toilet_coverage_percent").notNull().default(0),
  handwashingFacilityPercent: real("handwashing_facility_percent").notNull().default(0),
  
  // Health & Social Indicators
  childMarriageRate: real("child_marriage_rate").notNull().default(0),
  malnutritionStunting: real("malnutrition_stunting").notNull().default(0),
  malnutritionWasting: real("malnutrition_wasting").notNull().default(0),
  malnutritionUnderweight: real("malnutrition_underweight").notNull().default(0),
  infantMortalityRate: real("infant_mortality_rate").notNull().default(0),
  maternalMortalityRatio: real("maternal_mortality_ratio").notNull().default(0),
  
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

// User schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// District schemas
export const insertDistrictSchema = createInsertSchema(districts).omit({
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
export type District = typeof districts.$inferSelect;
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
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
