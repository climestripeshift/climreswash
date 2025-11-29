import { 
  type User, 
  type InsertUser, 
  type District, 
  type InsertDistrict,
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
  users,
  districts,
  apiIntegrations,
  alerts,
  aqiObservations,
  interventions,
  communityReports
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllDistricts(): Promise<District[]>;
  getDistrict(id: string): Promise<District | undefined>;
  createDistrict(district: InsertDistrict): Promise<District>;
  updateDistrict(id: string, district: Partial<InsertDistrict>): Promise<District | undefined>;
  deleteDistrict(id: string): Promise<boolean>;
  
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

  async getAllDistricts(): Promise<District[]> {
    return await db.select().from(districts);
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
}

export const storage = new DatabaseStorage();
