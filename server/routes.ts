import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDistrictSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // District Routes
  app.get("/api/districts", async (_req, res) => {
    try {
      const districts = await storage.getAllDistricts();
      res.json(districts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/districts/:id", async (req, res) => {
    try {
      const district = await storage.getDistrict(req.params.id);
      if (!district) {
        return res.status(404).json({ error: "District not found" });
      }
      res.json(district);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/districts", async (req, res) => {
    try {
      const validated = insertDistrictSchema.parse(req.body);
      const district = await storage.createDistrict(validated);
      res.status(201).json(district);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/districts/:id", async (req, res) => {
    try {
      const district = await storage.updateDistrict(req.params.id, req.body);
      if (!district) {
        return res.status(404).json({ error: "District not found" });
      }
      res.json(district);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/districts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteDistrict(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "District not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Integration Routes
  app.get("/api/integrations", async (_req, res) => {
    try {
      const integrations = await storage.getAllIntegrations();
      res.json(integrations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const integration = await storage.updateIntegration(req.params.id, req.body);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(integration);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mock IMD API endpoint
  app.get("/api/imd/forecast/:region", async (req, res) => {
    try {
      // Mock IMD weather data
      const mockData = {
        region: req.params.region,
        forecast: [
          { date: "2025-01-15", tempMax: 28, tempMin: 18, rainfall: 0, humidity: 45 },
          { date: "2025-01-16", tempMax: 30, tempMin: 19, rainfall: 0, humidity: 42 },
          { date: "2025-01-17", tempMax: 31, tempMin: 20, rainfall: 0, humidity: 40 },
        ],
        alerts: ["Heat advisory in effect for next 3 days"]
      };
      res.json(mockData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mock Groundwater API endpoint
  app.get("/api/groundwater/levels/:district", async (req, res) => {
    try {
      // Mock CGWB groundwater data
      const mockData = {
        district: req.params.district,
        measurements: [
          { date: "2025-01-01", depth: 45.2, quality: "Good", aquiferType: "Alluvial" },
          { date: "2024-12-01", depth: 42.1, quality: "Good", aquiferType: "Alluvial" },
          { date: "2024-11-01", depth: 38.5, quality: "Moderate", aquiferType: "Alluvial" },
        ],
        trend: "Declining",
        recommendations: ["Implement rainwater harvesting", "Monitor extraction rates"]
      };
      res.json(mockData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
