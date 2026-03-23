import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDistrictSchema, insertAlertSchema, insertAqiObservationSchema, insertInterventionSchema, insertCommunityReportSchema, insertCountrySchema, insertStateSchema, insertBlockSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { recomputeAllAlerts } from "./earlyWarning";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Country Routes (aggregate level)
  app.get("/api/countries", async (_req, res) => {
    try {
      const countriesList = await storage.getAllCountries();
      res.json(countriesList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/countries/:id", async (req, res) => {
    try {
      const country = await storage.getCountry(req.params.id);
      if (!country) {
        return res.status(404).json({ error: "Country not found" });
      }
      res.json(country);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/countries/:id/states", async (req, res) => {
    try {
      const statesList = await storage.getStatesByCountry(req.params.id);
      res.json(statesList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // State Routes (aggregate level)
  app.get("/api/states", async (_req, res) => {
    try {
      const statesList = await storage.getAllStates();
      res.json(statesList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/states/:id", async (req, res) => {
    try {
      const state = await storage.getState(req.params.id);
      if (!state) {
        return res.status(404).json({ error: "State not found" });
      }
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/states/:id/districts", async (req, res) => {
    try {
      const districtsList = await storage.getDistrictsByState(req.params.id);
      res.json(districtsList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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

  // Block Routes (sub-district level)
  app.get("/api/blocks", async (_req, res) => {
    try {
      const blocksList = await storage.getAllBlocks();
      res.json(blocksList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/blocks/:id", async (req, res) => {
    try {
      const block = await storage.getBlock(req.params.id);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }
      res.json(block);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/districts/:id/blocks", async (req, res) => {
    try {
      const blocksList = await storage.getBlocksByDistrict(req.params.id);
      res.json(blocksList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/blocks", async (req, res) => {
    try {
      const validated = insertBlockSchema.parse(req.body);
      const block = await storage.createBlock(validated);
      res.status(201).json(block);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/blocks/:id", async (req, res) => {
    try {
      const block = await storage.updateBlock(req.params.id, req.body);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }
      res.json(block);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/blocks/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteBlock(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Block not found" });
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

  // Alerts Routes
  app.get("/api/alerts", async (_req, res) => {
    try {
      const activeAlerts = await storage.getActiveAlerts();
      res.json(activeAlerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alerts/all", async (_req, res) => {
    try {
      const allAlerts = await storage.getAllAlerts();
      res.json(allAlerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/districts/:id/alerts", async (req, res) => {
    try {
      const alerts = await storage.getAlertsByDistrict(req.params.id);
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const validated = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(validated);
      res.status(201).json(alert);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/alerts/:id/deactivate", async (req, res) => {
    try {
      const alert = await storage.deactivateAlert(req.params.id);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json(alert);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alerts/recompute", async (_req, res) => {
    try {
      const newAlerts = await recomputeAllAlerts();
      res.json({ message: "Alerts recomputed", count: newAlerts.length, alerts: newAlerts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AQI Routes
  app.get("/api/aqi", async (_req, res) => {
    try {
      const allAqi = await storage.getAllLatestAqi();
      res.json(allAqi);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/districts/:id/aqi", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const history = await storage.getAqiHistory(req.params.id, days);
      const latest = await storage.getLatestAqi(req.params.id);
      res.json({ latest, history });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/aqi", async (req, res) => {
    try {
      const validated = insertAqiObservationSchema.parse(req.body);
      const observation = await storage.createAqiObservation(validated);
      res.status(201).json(observation);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Mock IMD API endpoint
  app.get("/api/imd/forecast/:region", async (req, res) => {
    try {
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

  // Interventions Routes
  app.get("/api/interventions", async (_req, res) => {
    try {
      const interventions = await storage.getAllInterventions();
      res.json(interventions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alerts/:alertId/interventions", async (req, res) => {
    try {
      const interventions = await storage.getInterventionsByAlert(req.params.alertId);
      res.json(interventions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/districts/:id/interventions", async (req, res) => {
    try {
      const interventions = await storage.getInterventionsByDistrict(req.params.id);
      res.json(interventions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interventions", async (req, res) => {
    try {
      const validated = insertInterventionSchema.parse(req.body);
      const intervention = await storage.createIntervention(validated);
      res.status(201).json(intervention);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/interventions/:id", async (req, res) => {
    try {
      const intervention = await storage.updateIntervention(req.params.id, req.body);
      if (!intervention) {
        return res.status(404).json({ error: "Intervention not found" });
      }
      res.json(intervention);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/interventions/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteIntervention(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Intervention not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Community Reports Routes
  app.get("/api/community-reports", async (_req, res) => {
    try {
      const reports = await storage.getAllCommunityReports();
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/districts/:id/community-reports", async (req, res) => {
    try {
      const reports = await storage.getCommunityReportsByDistrict(req.params.id);
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/community-reports", async (req, res) => {
    try {
      const validated = insertCommunityReportSchema.parse(req.body);
      const report = await storage.createCommunityReport(validated);
      res.status(201).json(report);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/community-reports/:id/status", async (req, res) => {
    try {
      const report = await storage.updateCommunityReportStatus(req.params.id, req.body.status);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Technology Library CRUD
  app.get("/api/technologies", async (_req, res) => {
    try {
      const techs = await storage.getAllTechnologies();
      res.json(techs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/technologies/:id", async (req, res) => {
    try {
      const tech = await storage.getTechnology(req.params.id);
      if (!tech) return res.status(404).json({ error: "Not found" });
      res.json(tech);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/technologies", async (req, res) => {
    try {
      const tech = await storage.createTechnology(req.body);
      res.status(201).json(tech);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/technologies/:id", async (req, res) => {
    try {
      const tech = await storage.updateTechnology(req.params.id, req.body);
      if (!tech) return res.status(404).json({ error: "Not found" });
      res.json(tech);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/technologies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTechnology(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
