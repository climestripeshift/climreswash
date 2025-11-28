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

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type District = typeof districts.$inferSelect;
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type ApiIntegration = typeof apiIntegrations.$inferSelect;
export type InsertApiIntegration = z.infer<typeof insertApiIntegrationSchema>;
