import {
  type User,
  type InsertUser,
  type Country,
  type InsertCountry,
  type State,
  type InsertState,
  type District,
  type InsertDistrict,
  type Block,
  type InsertBlock,
  type ApiIntegration,
  type InsertApiIntegration,
  type Alert,
  type InsertAlert,
  type AqiObservation,
  type InsertAqiObservation,
  type Intervention,
  type InsertIntervention,
  type CommunityReport,
  type InsertCommunityReport,
  type Technology,
  type InsertTechnology,
  type HazardProjection,
  type InsertHazardProjection,
  type VulnerabilityProjection,
  type InsertVulnerabilityProjection,
  users,
  countries,
  states,
  districts,
  blocks,
  apiIntegrations,
  alerts,
  aqiObservations,
  interventions,
  communityReports,
  technologies,
  hazardProjections,
  vulnerabilityProjections,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, desc, asc, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Geographic Hierarchy
  getAllCountries(): Promise<Country[]>;
  getCountry(id: string): Promise<Country | undefined>;
  createCountry(country: InsertCountry): Promise<Country>;
  updateCountry(id: string, country: Partial<InsertCountry>): Promise<Country | undefined>;
  
  getAllStates(): Promise<State[]>;
  getStatesByCountry(countryId: string): Promise<State[]>;
  getState(id: string): Promise<State | undefined>;
  createState(state: InsertState): Promise<State>;
  updateState(id: string, state: Partial<InsertState>): Promise<State | undefined>;
  
  getAllDistricts(): Promise<District[]>;
  getDistrictsByState(stateId: string): Promise<District[]>;
  getDistrictsByCountry(countryId: string): Promise<District[]>;
  getDistrictGeometries(countryId?: string): Promise<Array<{ id: string; name: string; stateId: string; countryId: string; geometry: any }>>;
  getDistrict(id: string): Promise<District | undefined>;
  createDistrict(district: InsertDistrict): Promise<District>;
  updateDistrict(id: string, district: Partial<InsertDistrict>): Promise<District | undefined>;
  deleteDistrict(id: string): Promise<boolean>;
  
  getAllBlocks(): Promise<Block[]>;
  getBlocksByDistrict(districtId: string): Promise<Block[]>;
  getBlock(id: string): Promise<Block | undefined>;
  
  // Technology Library
  getAllTechnologies(): Promise<Technology[]>;
  getTechnology(id: string): Promise<Technology | undefined>;
  createTechnology(tech: InsertTechnology): Promise<Technology>;
  updateTechnology(id: string, tech: Partial<InsertTechnology>): Promise<Technology | undefined>;
  deleteTechnology(id: string): Promise<boolean>;
  createBlock(block: InsertBlock): Promise<Block>;
  updateBlock(id: string, block: Partial<InsertBlock>): Promise<Block | undefined>;
  deleteBlock(id: string): Promise<boolean>;
  
  getAllIntegrations(): Promise<ApiIntegration[]>;
  getIntegration(id: string): Promise<ApiIntegration | undefined>;
  updateIntegration(id: string, integration: Partial<InsertApiIntegration>): Promise<ApiIntegration | undefined>;
  createIntegration(integration: InsertApiIntegration): Promise<ApiIntegration>;
  
  getAllAlerts(): Promise<Alert[]>;
  getActiveAlerts(): Promise<Alert[]>;
  getAlertsByDistrict(districtId: string): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  deactivateAlert(id: string): Promise<Alert | undefined>;
  
  getLatestAqi(districtId: string): Promise<AqiObservation | undefined>;
  getAqiHistory(districtId: string, days: number): Promise<AqiObservation[]>;
  createAqiObservation(observation: InsertAqiObservation): Promise<AqiObservation>;
  getAllLatestAqi(): Promise<AqiObservation[]>;
  
  getAllInterventions(): Promise<Intervention[]>;
  getInterventionsByAlert(alertId: string): Promise<Intervention[]>;
  getInterventionsByDistrict(districtId: string): Promise<Intervention[]>;
  createIntervention(intervention: InsertIntervention): Promise<Intervention>;
  updateIntervention(id: string, intervention: Partial<InsertIntervention>): Promise<Intervention | undefined>;
  deleteIntervention(id: string): Promise<boolean>;
  
  getAllCommunityReports(): Promise<CommunityReport[]>;
  getCommunityReportsByDistrict(districtId: string): Promise<CommunityReport[]>;
  createCommunityReport(report: InsertCommunityReport): Promise<CommunityReport>;
  updateCommunityReportStatus(id: string, status: string): Promise<CommunityReport | undefined>;

  // Stress-test projections
  hasProjections(countryId?: string): Promise<boolean>;
  getProjectionCountries(): Promise<Array<{ id: string; name: string }>>;
  getHazardProjections(districtId: string): Promise<HazardProjection[]>;
  getVulnerabilityProjections(districtId: string): Promise<VulnerabilityProjection[]>;
  getProjectionRankings(
    scenario: string,
    horizonYear: number,
    metric: 'deterioration' | 'avoided_damage',
    limit: number,
    countryId?: string
  ): Promise<Array<VulnerabilityProjection & { districtName: string; stateId: string; countryId: string }>>;
  getProjectionMapData(
    scenario: string,
    horizonYear: number,
    metric: 'deterioration' | 'avoided_damage',
    limit: number,
    countryId?: string
  ): Promise<Array<{ districtId: string; districtName: string; stateId: string; countryId: string; deterioration: number | null; avoidedDamage: number | null; vulnerability: number; hazardBreakdown: Record<string, number> | null }>>;
  upsertHazardProjection(projection: InsertHazardProjection): Promise<void>;
  upsertVulnerabilityProjection(projection: InsertVulnerabilityProjection): Promise<void>;
  bulkInsertHazardProjections(rows: InsertHazardProjection[]): Promise<void>;
  bulkInsertVulnerabilityProjections(rows: InsertVulnerabilityProjection[]): Promise<void>;
  clearProjections(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Countries
  async getAllCountries(): Promise<Country[]> {
    return await db.select().from(countries);
  }

  async getCountry(id: string): Promise<Country | undefined> {
    const [country] = await db.select().from(countries).where(eq(countries.id, id));
    return country || undefined;
  }

  async createCountry(country: InsertCountry): Promise<Country> {
    const [created] = await db.insert(countries).values(country).returning();
    return created;
  }

  async updateCountry(id: string, country: Partial<InsertCountry>): Promise<Country | undefined> {
    const [updated] = await db
      .update(countries)
      .set({ ...country, updatedAt: new Date() })
      .where(eq(countries.id, id))
      .returning();
    return updated || undefined;
  }

  // States
  async getAllStates(): Promise<State[]> {
    return await db.select().from(states);
  }

  async getStatesByCountry(countryId: string): Promise<State[]> {
    return await db.select().from(states).where(eq(states.countryId, countryId));
  }

  async getState(id: string): Promise<State | undefined> {
    const [state] = await db.select().from(states).where(eq(states.id, id));
    return state || undefined;
  }

  async createState(state: InsertState): Promise<State> {
    const [created] = await db.insert(states).values(state).returning();
    return created;
  }

  async updateState(id: string, state: Partial<InsertState>): Promise<State | undefined> {
    const [updated] = await db
      .update(states)
      .set({ ...state, updatedAt: new Date() })
      .where(eq(states.id, id))
      .returning();
    return updated || undefined;
  }

  // Districts
  async getAllDistricts(): Promise<District[]> {
    const rows = await db.select().from(districts);
    return rows.map(({ geometry: _g, seasonalData: _s, ...rest }) => rest as District);
  }

  async getDistrictsByState(stateId: string): Promise<District[]> {
    const rows = await db.select().from(districts).where(eq(districts.stateId, stateId));
    return rows.map(({ geometry: _g, seasonalData: _s, ...rest }) => rest as District);
  }

  async getDistrictsByCountry(countryId: string): Promise<District[]> {
    const rows = await db.select().from(districts).where(eq(districts.countryId, countryId));
    return rows.map(({ geometry: _g, seasonalData: _s, ...rest }) => rest as District);
  }

  async getDistrictGeometries(countryId?: string): Promise<Array<{ id: string; name: string; stateId: string; countryId: string; geometry: any }>> {
    const base = db
      .select({
        id: districts.id,
        name: districts.name,
        stateId: districts.stateId,
        countryId: districts.countryId,
        geometry: districts.geometry,
      })
      .from(districts);
    const rows = countryId
      ? await base.where(eq(districts.countryId, countryId))
      : await base;
    return rows;
  }

  async getDistrict(id: string): Promise<District | undefined> {
    const [district] = await db.select().from(districts).where(eq(districts.id, id));
    return district || undefined;
  }

  async createDistrict(district: InsertDistrict): Promise<District> {
    const [created] = await db
      .insert(districts)
      .values(district as any)
      .returning();
    return created;
  }

  async updateDistrict(id: string, district: Partial<InsertDistrict>): Promise<District | undefined> {
    const [updated] = await db
      .update(districts)
      .set(district as any)
      .where(eq(districts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteDistrict(id: string): Promise<boolean> {
    const result = await db.delete(districts).where(eq(districts.id, id)).returning();
    return result.length > 0;
  }

  // Blocks
  async getAllBlocks(): Promise<Block[]> {
    return await db.select().from(blocks);
  }

  async getBlocksByDistrict(districtId: string): Promise<Block[]> {
    return await db.select().from(blocks).where(eq(blocks.districtId, districtId));
  }

  async getBlock(id: string): Promise<Block | undefined> {
    const [block] = await db.select().from(blocks).where(eq(blocks.id, id));
    return block || undefined;
  }

  async createBlock(block: InsertBlock): Promise<Block> {
    const [created] = await db.insert(blocks).values(block).returning();
    return created;
  }

  async updateBlock(id: string, block: Partial<InsertBlock>): Promise<Block | undefined> {
    const [updated] = await db
      .update(blocks)
      .set({ ...block, updatedAt: new Date() })
      .where(eq(blocks.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBlock(id: string): Promise<boolean> {
    const result = await db.delete(blocks).where(eq(blocks.id, id)).returning();
    return result.length > 0;
  }

  async getAllIntegrations(): Promise<ApiIntegration[]> {
    return await db.select().from(apiIntegrations);
  }

  async getIntegration(id: string): Promise<ApiIntegration | undefined> {
    const [integration] = await db.select().from(apiIntegrations).where(eq(apiIntegrations.id, id));
    return integration || undefined;
  }

  async updateIntegration(id: string, integration: Partial<InsertApiIntegration>): Promise<ApiIntegration | undefined> {
    const [updated] = await db
      .update(apiIntegrations)
      .set(integration)
      .where(eq(apiIntegrations.id, id))
      .returning();
    return updated || undefined;
  }

  async createIntegration(integration: InsertApiIntegration): Promise<ApiIntegration> {
    const [created] = await db.insert(apiIntegrations).values(integration).returning();
    return created;
  }

  async getAllAlerts(): Promise<Alert[]> {
    return await db.select().from(alerts).orderBy(desc(alerts.createdAt));
  }

  async getActiveAlerts(): Promise<Alert[]> {
    const now = new Date();
    return await db.select().from(alerts)
      .where(and(eq(alerts.isActive, 1), gte(alerts.validUntil, now)))
      .orderBy(desc(alerts.createdAt));
  }

  async getAlertsByDistrict(districtId: string): Promise<Alert[]> {
    return await db.select().from(alerts)
      .where(eq(alerts.districtId, districtId))
      .orderBy(desc(alerts.createdAt));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    return created;
  }

  async deactivateAlert(id: string): Promise<Alert | undefined> {
    const [updated] = await db
      .update(alerts)
      .set({ isActive: 0 })
      .where(eq(alerts.id, id))
      .returning();
    return updated || undefined;
  }

  async getLatestAqi(districtId: string): Promise<AqiObservation | undefined> {
    const [latest] = await db.select().from(aqiObservations)
      .where(eq(aqiObservations.districtId, districtId))
      .orderBy(desc(aqiObservations.observedAt))
      .limit(1);
    return latest || undefined;
  }

  async getAqiHistory(districtId: string, days: number): Promise<AqiObservation[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return await db.select().from(aqiObservations)
      .where(and(eq(aqiObservations.districtId, districtId), gte(aqiObservations.observedAt, cutoff)))
      .orderBy(desc(aqiObservations.observedAt));
  }

  async createAqiObservation(observation: InsertAqiObservation): Promise<AqiObservation> {
    const [created] = await db.insert(aqiObservations).values(observation).returning();
    return created;
  }

  async getAllLatestAqi(): Promise<AqiObservation[]> {
    const allDistricts = await db.select().from(districts);
    const latest: AqiObservation[] = [];
    for (const district of allDistricts) {
      const aqi = await this.getLatestAqi(district.id);
      if (aqi) latest.push(aqi);
    }
    return latest;
  }

  async getAllInterventions(): Promise<Intervention[]> {
    return await db.select().from(interventions).orderBy(desc(interventions.createdAt));
  }

  async getInterventionsByAlert(alertId: string): Promise<Intervention[]> {
    return await db.select().from(interventions)
      .where(eq(interventions.alertId, alertId))
      .orderBy(desc(interventions.createdAt));
  }

  async getInterventionsByDistrict(districtId: string): Promise<Intervention[]> {
    return await db.select().from(interventions)
      .where(eq(interventions.districtId, districtId))
      .orderBy(desc(interventions.createdAt));
  }

  async createIntervention(intervention: InsertIntervention): Promise<Intervention> {
    const [created] = await db.insert(interventions)
      .values({ ...intervention, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateIntervention(id: string, intervention: Partial<InsertIntervention>): Promise<Intervention | undefined> {
    const [updated] = await db
      .update(interventions)
      .set({ ...intervention, updatedAt: new Date() })
      .where(eq(interventions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteIntervention(id: string): Promise<boolean> {
    const result = await db.delete(interventions).where(eq(interventions.id, id)).returning();
    return result.length > 0;
  }

  async getAllCommunityReports(): Promise<CommunityReport[]> {
    return await db.select().from(communityReports).orderBy(desc(communityReports.createdAt));
  }

  async getCommunityReportsByDistrict(districtId: string): Promise<CommunityReport[]> {
    return await db.select().from(communityReports)
      .where(eq(communityReports.districtId, districtId))
      .orderBy(desc(communityReports.createdAt));
  }

  async createCommunityReport(report: InsertCommunityReport): Promise<CommunityReport> {
    const [created] = await db.insert(communityReports).values(report).returning();
    return created;
  }

  async updateCommunityReportStatus(id: string, status: string): Promise<CommunityReport | undefined> {
    const [updated] = await db
      .update(communityReports)
      .set({ status })
      .where(eq(communityReports.id, id))
      .returning();
    return updated || undefined;
  }

  async getAllTechnologies(): Promise<Technology[]> {
    return await db.select().from(technologies).orderBy(technologies.category, technologies.title);
  }

  async getTechnology(id: string): Promise<Technology | undefined> {
    const [tech] = await db.select().from(technologies).where(eq(technologies.id, id));
    return tech || undefined;
  }

  async createTechnology(tech: InsertTechnology): Promise<Technology> {
    const [created] = await db.insert(technologies)
      .values({ ...tech, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateTechnology(id: string, tech: Partial<InsertTechnology>): Promise<Technology | undefined> {
    const [updated] = await db
      .update(technologies)
      .set({ ...tech, updatedAt: new Date() })
      .where(eq(technologies.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTechnology(id: string): Promise<boolean> {
    const result = await db.delete(technologies).where(eq(technologies.id, id)).returning();
    return result.length > 0;
  }

  // ── Stress-test projections ───────────────────────────────────────────────

  async hasProjections(countryId?: string): Promise<boolean> {
    const base = db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(vulnerabilityProjections);
    const [row] = countryId
      ? await base
          .innerJoin(districts, eq(vulnerabilityProjections.districtId, districts.id))
          .where(eq(districts.countryId, countryId))
      : await base;
    return (row?.cnt ?? 0) > 0;
  }

  async getProjectionCountries(): Promise<Array<{ id: string; name: string }>> {
    const rows = await db
      .selectDistinct({ id: districts.countryId, name: countries.name })
      .from(vulnerabilityProjections)
      .innerJoin(districts, eq(vulnerabilityProjections.districtId, districts.id))
      .innerJoin(countries, eq(districts.countryId, countries.id));
    return rows;
  }

  async getHazardProjections(districtId: string): Promise<HazardProjection[]> {
    return await db
      .select()
      .from(hazardProjections)
      .where(eq(hazardProjections.districtId, districtId))
      .orderBy(hazardProjections.scenario, asc(hazardProjections.horizonYear), hazardProjections.hazard);
  }

  async getVulnerabilityProjections(districtId: string): Promise<VulnerabilityProjection[]> {
    return await db
      .select()
      .from(vulnerabilityProjections)
      .where(eq(vulnerabilityProjections.districtId, districtId))
      .orderBy(vulnerabilityProjections.scenario, asc(vulnerabilityProjections.horizonYear));
  }

  async getProjectionRankings(
    scenario: string,
    horizonYear: number,
    metric: 'deterioration' | 'avoided_damage',
    limit: number,
    countryId?: string
  ) {
    const col = metric === 'avoided_damage'
      ? vulnerabilityProjections.avoidedDamage
      : vulnerabilityProjections.deterioration;

    const rows = await db
      .select({
        districtId:        vulnerabilityProjections.districtId,
        scenario:          vulnerabilityProjections.scenario,
        horizonYear:       vulnerabilityProjections.horizonYear,
        exposureComposite: vulnerabilityProjections.exposureComposite,
        sensitivity:       vulnerabilityProjections.sensitivity,
        adaptiveCap:       vulnerabilityProjections.adaptiveCap,
        vulnerability:     vulnerabilityProjections.vulnerability,
        deterioration:     vulnerabilityProjections.deterioration,
        avoidedDamage:     vulnerabilityProjections.avoidedDamage,
        hazardWeights:     vulnerabilityProjections.hazardWeights,
        hazardBreakdown:   vulnerabilityProjections.hazardBreakdown,
        computedAt:        vulnerabilityProjections.computedAt,
        districtName:      districts.name,
        stateId:           districts.stateId,
        countryId:         districts.countryId,
      })
      .from(vulnerabilityProjections)
      .innerJoin(districts, eq(vulnerabilityProjections.districtId, districts.id))
      .where(
        and(
          eq(vulnerabilityProjections.scenario, scenario),
          eq(vulnerabilityProjections.horizonYear, horizonYear),
          ...(countryId ? [eq(districts.countryId, countryId)] : [])
        )
      )
      .orderBy(desc(col))
      .limit(limit);

    return rows;
  }

  async getProjectionMapData(
    scenario: string,
    horizonYear: number,
    metric: 'deterioration' | 'avoided_damage',
    limit: number,
    countryId?: string
  ) {
    const col = metric === 'avoided_damage'
      ? vulnerabilityProjections.avoidedDamage
      : vulnerabilityProjections.deterioration;

    return await db
      .select({
        districtId:      vulnerabilityProjections.districtId,
        districtName:    districts.name,
        stateId:         districts.stateId,
        countryId:       districts.countryId,
        deterioration:   vulnerabilityProjections.deterioration,
        avoidedDamage:   vulnerabilityProjections.avoidedDamage,
        vulnerability:   vulnerabilityProjections.vulnerability,
        hazardBreakdown: vulnerabilityProjections.hazardBreakdown,
      })
      .from(vulnerabilityProjections)
      .innerJoin(districts, eq(vulnerabilityProjections.districtId, districts.id))
      .where(
        and(
          eq(vulnerabilityProjections.scenario, scenario),
          eq(vulnerabilityProjections.horizonYear, horizonYear),
          ...(countryId ? [eq(districts.countryId, countryId)] : [])
        )
      )
      .orderBy(desc(col))
      .limit(limit);
  }

  async upsertHazardProjection(projection: InsertHazardProjection): Promise<void> {
    await db
      .insert(hazardProjections)
      .values(projection)
      .onConflictDoUpdate({
        target: [
          hazardProjections.districtId,
          hazardProjections.scenario,
          hazardProjections.horizonYear,
          hazardProjections.hazard,
        ],
        set: {
          rawValue:    projection.rawValue,
          normValue:   projection.normValue,
          modelSpread: projection.modelSpread,
          cmip6Models: projection.cmip6Models,
          source:      projection.source,
          computedAt:  new Date(),
        },
      });
  }

  async upsertVulnerabilityProjection(projection: InsertVulnerabilityProjection): Promise<void> {
    await db
      .insert(vulnerabilityProjections)
      .values(projection)
      .onConflictDoUpdate({
        target: [
          vulnerabilityProjections.districtId,
          vulnerabilityProjections.scenario,
          vulnerabilityProjections.horizonYear,
        ],
        set: {
          exposureComposite: projection.exposureComposite,
          sensitivity:       projection.sensitivity,
          adaptiveCap:       projection.adaptiveCap,
          vulnerability:     projection.vulnerability,
          deterioration:     projection.deterioration,
          avoidedDamage:     projection.avoidedDamage,
          hazardWeights:     projection.hazardWeights,
          hazardBreakdown:   projection.hazardBreakdown,
          computedAt:        new Date(),
        },
      });
  }

  async bulkInsertHazardProjections(rows: InsertHazardProjection[]): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(hazardProjections)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [
            hazardProjections.districtId,
            hazardProjections.scenario,
            hazardProjections.horizonYear,
            hazardProjections.hazard,
          ],
          set: {
            rawValue:    sql`excluded.raw_value`,
            normValue:   sql`excluded.norm_value`,
            modelSpread: sql`excluded.model_spread`,
            cmip6Models: sql`excluded.cmip6_models`,
            source:      sql`excluded.source`,
            computedAt:  sql`now()`,
          },
        });
    }
  }

  async bulkInsertVulnerabilityProjections(rows: InsertVulnerabilityProjection[]): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(vulnerabilityProjections)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [
            vulnerabilityProjections.districtId,
            vulnerabilityProjections.scenario,
            vulnerabilityProjections.horizonYear,
          ],
          set: {
            exposureComposite: sql`excluded.exposure_composite`,
            sensitivity:       sql`excluded.sensitivity`,
            adaptiveCap:       sql`excluded.adaptive_cap`,
            vulnerability:     sql`excluded.vulnerability`,
            deterioration:     sql`excluded.deterioration`,
            avoidedDamage:     sql`excluded.avoided_damage`,
            hazardWeights:     sql`excluded.hazard_weights`,
            hazardBreakdown:   sql`excluded.hazard_breakdown`,
            computedAt:        sql`now()`,
          },
        });
    }
  }

  async clearProjections(): Promise<void> {
    await db.delete(vulnerabilityProjections);
    await db.delete(hazardProjections);
  }
}

export const storage = new DatabaseStorage();
