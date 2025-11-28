import { 
  type User, 
  type InsertUser, 
  type District, 
  type InsertDistrict,
  type ApiIntegration,
  type InsertApiIntegration,
  users,
  districts,
  apiIntegrations
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // District methods
  getAllDistricts(): Promise<District[]>;
  getDistrict(id: string): Promise<District | undefined>;
  createDistrict(district: InsertDistrict): Promise<District>;
  updateDistrict(id: string, district: Partial<InsertDistrict>): Promise<District | undefined>;
  deleteDistrict(id: string): Promise<boolean>;
  
  // API Integration methods
  getAllIntegrations(): Promise<ApiIntegration[]>;
  getIntegration(id: string): Promise<ApiIntegration | undefined>;
  updateIntegration(id: string, integration: Partial<InsertApiIntegration>): Promise<ApiIntegration | undefined>;
  createIntegration(integration: InsertApiIntegration): Promise<ApiIntegration>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // District methods
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
      .values({
        ...district,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return created;
  }

  async updateDistrict(id: string, district: Partial<InsertDistrict>): Promise<District | undefined> {
    const updateData: any = { ...district, updatedAt: new Date() };
    const [updated] = await db
      .update(districts)
      .set(updateData)
      .where(eq(districts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteDistrict(id: string): Promise<boolean> {
    const result = await db.delete(districts).where(eq(districts.id, id)).returning();
    return result.length > 0;
  }

  // API Integration methods
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
    const [created] = await db
      .insert(apiIntegrations)
      .values(integration)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
