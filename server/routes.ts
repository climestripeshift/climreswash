import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDistrictSchema, insertAlertSchema, insertAqiObservationSchema, insertInterventionSchema, insertCommunityReportSchema, insertCountrySchema, insertStateSchema, insertBlockSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { recomputeAllAlerts } from "./earlyWarning";
import { loginHandler, logoutHandler, meHandler, requireAdmin } from "./auth";
import { importCVIData } from "./importCVI";

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

  // GeoJSON endpoint – serves district geometries from the DB
  app.get("/api/districts/geojson", async (req, res) => {
    try {
      const { country } = req.query as { country?: string };
      const rows = await storage.getDistrictGeometries(country);
      const features = rows
        .filter(r => r.geometry != null)
        .map(r => ({
          type: "Feature",
          properties: { ID: r.id, DISTRICT: r.name, STATE: r.stateId, COUNTRY: r.countryId },
          geometry: r.geometry
        }));
      res.json({ type: "FeatureCollection", features });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // District Routes
  app.get("/api/districts", async (req, res) => {
    try {
      const { country } = req.query as { country?: string };
      const districts = country
        ? await storage.getDistrictsByCountry(country)
        : await storage.getAllDistricts();
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

  app.post("/api/districts", requireAdmin, async (req, res) => {
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

  app.patch("/api/districts/:id", requireAdmin, async (req, res) => {
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

  app.delete("/api/districts/:id", requireAdmin, async (req, res) => {
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

  // ─── Live Weather Layer (Open-Meteo, no auth needed) ───────────────────────
  const weatherCache = new Map<string, { data: any[]; ts: number }>();
  const WEATHER_TTL = 3 * 60 * 60 * 1000; // 3 hours

  function computeCentroid(geometry: any): { lat: number; lng: number } | null {
    try {
      if (!geometry) return null;
      let coords: [number, number][] = [];
      if (geometry.type === 'Polygon') coords = geometry.coordinates[0];
      else if (geometry.type === 'MultiPolygon') coords = geometry.coordinates.flatMap((p: any) => p[0]);
      if (!coords.length) return null;
      const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      return { lat, lng };
    } catch { return null; }
  }

  function toWeatherSeverity(temp: number, rain: number, wind: number): string {
    if (temp >= 45 || rain >= 100 || wind >= 100) return 'emergency';
    if (temp >= 40 || rain >= 50  || wind >= 70)  return 'warning';
    if (temp >= 35 || rain >= 20  || wind >= 50)  return 'watch';
    return 'normal';
  }

  function weatherConditionLabel(code: number): string {
    if (code === 0) return 'Clear sky';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 9) return 'Foggy / hazy';
    if (code <= 19) return 'Drizzle';
    if (code <= 29) return 'Rain';
    if (code <= 39) return 'Snow / sleet';
    if (code <= 49) return 'Fog';
    if (code <= 59) return 'Drizzle';
    if (code <= 69) return 'Rain';
    if (code <= 79) return 'Snow';
    if (code <= 84) return 'Rain shower';
    if (code <= 94) return 'Thunderstorm';
    return 'Severe thunderstorm';
  }

  app.get("/api/weather-layer", async (req, res) => {
    const country = (req.query.country as string) || 'IND';
    const cached = weatherCache.get(country);
    if (cached && Date.now() - cached.ts < WEATHER_TTL) {
      res.setHeader('X-Weather-Cache', 'HIT');
      return res.json(cached.data);
    }
    try {
      const { db } = await import("./db");
      const { districts } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const rows = await db
        .select({ id: districts.id, name: districts.name, geometry: districts.geometry })
        .from(districts)
        .where(eq(districts.countryId, country))
        .limit(250);

      const withCentroids = rows
        .map(r => ({ id: r.id, name: r.name, centroid: computeCentroid(r.geometry as any) }))
        .filter(r => r.centroid !== null) as { id: string; name: string; centroid: { lat: number; lng: number } }[];

      const results: any[] = [];
      const BATCH = 20;
      for (let i = 0; i < withCentroids.length; i += BATCH) {
        const batch = withCentroids.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map(async ({ id, name, centroid }) => {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${centroid.lat.toFixed(4)}&longitude=${centroid.lng.toFixed(4)}&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code&timezone=auto&forecast_days=1`;
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) throw new Error('open-meteo error');
          const d = await r.json();
          const temp  = d.current?.temperature_2m        ?? 25;
          const rain  = d.current?.precipitation          ?? 0;
          const wind  = d.current?.wind_speed_10m         ?? 0;
          const humidity = d.current?.relative_humidity_2m ?? 60;
          const code  = d.current?.weather_code           ?? 0;
          return { id, name,
            temp: Math.round(temp * 10) / 10,
            rain: Math.round(rain * 10) / 10,
            wind: Math.round(wind),
            humidity: Math.round(humidity),
            weatherCode: code,
            condition: weatherConditionLabel(code),
            severity: toWeatherSeverity(temp, rain, wind),
            fetchedAt: new Date().toISOString()
          };
        }));
        results.push(...settled.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value));
      }

      weatherCache.set(country, { data: results, ts: Date.now() });
      res.setHeader('X-Weather-Cache', 'MISS');
      res.json(results);
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

  app.post("/api/technologies", requireAdmin, async (req, res) => {
    try {
      const tech = await storage.createTechnology(req.body);
      res.status(201).json(tech);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/technologies/:id", requireAdmin, async (req, res) => {
    try {
      const tech = await storage.updateTechnology(req.params.id, req.body);
      if (!tech) return res.status(404).json({ error: "Not found" });
      res.json(tech);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/technologies/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteTechnology(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Auth routes ───────────────────────────────────────────────────────────
  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/logout", logoutHandler);
  app.get("/api/auth/me", meHandler);

  // ── Admin: CVI Data Import ─────────────────────────────────────────────────
  app.post("/api/admin/import-cvi", requireAdmin, async (_req, res) => {
    try {
      const result = await importCVIData();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Admin: Country Import from Excel data ──────────────────────────────────
  app.post("/api/admin/import-countries", requireAdmin, async (req, res) => {
    try {
      const { country, districts: districtRows } = req.body as {
        country: { id: string; name: string; population: number; totalDistricts: number };
        districts: any[];
      };
      if (!country?.id || !Array.isArray(districtRows) || districtRows.length === 0) {
        return res.status(400).json({ error: "Missing country info or district rows." });
      }

      const { db } = await import("./db");
      const { countries, states, districts } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      await db.insert(countries).values({
        id: country.id,
        name: country.name,
        population: country.population,
        totalStates: 1,
        totalDistricts: districtRows.length,
      }).onConflictDoUpdate({ target: countries.id, set: { name: country.name, population: country.population, totalDistricts: districtRows.length } });

      await db.insert(states).values({
        id: country.id,
        countryId: country.id,
        name: country.name,
        code: country.id,
        population: country.population,
        totalDistricts: districtRows.length,
        topClimateRisks: ["Flood", "Drought", "Heatwave"],
      }).onConflictDoNothing();

      let inserted = 0;
      let failed = 0;
      const errors: string[] = [];
      const CHUNK = 50;

      for (let i = 0; i < districtRows.length; i += CHUNK) {
        const chunk = districtRows.slice(i, i + CHUNK);
        for (const r of chunk) {
          try {
            const geomStr = r.geometry ? JSON.stringify(r.geometry).replace(/'/g, "''") : null;
            const seasonalArr = Array.isArray(r.seasonalData) ? r.seasonalData : [];
            const q = `
              INSERT INTO districts (
                id, country_id, state_id, name, population,
                vulnerability_score, adaptation_score,
                children_at_risk, elderly_at_risk,
                climate_risks, adaptation_strategies, impact_if_no_action,
                soil_type, rock_type, toilet_technology, water_supply_strategy,
                dropout_rate, water_access_percent, toilet_coverage_percent,
                handwashing_facility_percent, school_toilet_percent, school_water_percent,
                anganwadi_toilet_percent, anganwadi_water_percent,
                malnutrition_stunting, malnutrition_wasting, malnutrition_underweight,
                infant_mortality_rate, maternal_mortality_ratio,
                seasonal_data, geometry
              ) VALUES (
                '${String(r.id).replace(/'/g,"''")}',
                '${country.id}',
                '${country.id}',
                '${String(r.name||"").replace(/'/g,"''")}',
                ${Number(r.population)||0},
                ${Number(r.vulnerabilityScore)||0},
                ${Number(r.adaptationScore)||0},
                ${Number(r.childrenAtRisk)||0},
                ${Number(r.elderlyAtRisk)||0},
                ARRAY[${(r.climateRisks||[]).map((s:string)=>`'${s.replace(/'/g,"''")}'`).join(",")||""}]::text[],
                ARRAY[${(r.adaptationStrategies||[]).map((s:string)=>`'${s.replace(/'/g,"''")}'`).join(",")||""}]::text[],
                '${String(r.impactIfNoAction||"").replace(/'/g,"''")}',
                '${String(r.soilType||"Alluvial").replace(/'/g,"''")}',
                '${String(r.rockType||"Sandstone").replace(/'/g,"''")}',
                '${String(r.toiletTechnology||"Twin Pit").replace(/'/g,"''")}',
                '${String(r.waterSupplyStrategy||"Bore Well").replace(/'/g,"''")}',
                ${Number(r.dropoutRate)||0},
                ${Number(r.waterAccessPercent)||0},
                ${Number(r.toiletCoveragePercent)||0},
                ${Number(r.handwashingFacilityPercent)||0},
                ${r.schoolToiletPercent!=null?Number(r.schoolToiletPercent):"NULL"},
                ${r.schoolWaterPercent!=null?Number(r.schoolWaterPercent):"NULL"},
                ${r.anganwadiToiletPercent!=null?Number(r.anganwadiToiletPercent):"NULL"},
                ${r.anganwadiWaterPercent!=null?Number(r.anganwadiWaterPercent):"NULL"},
                ${Number(r.malnutritionStunting)||0},
                ${Number(r.malnutritionWasting)||0},
                ${Number(r.malnutritionUnderweight)||0},
                ${Number(r.infantMortalityRate)||0},
                ${Number(r.maternalMortalityRatio)||0},
                '${JSON.stringify(seasonalArr).replace(/'/g,"''")}',
                ${geomStr ? `'${geomStr}'::jsonb` : "NULL"}
              )
              ON CONFLICT (id) DO UPDATE SET
                country_id = EXCLUDED.country_id,
                name = EXCLUDED.name,
                population = EXCLUDED.population,
                vulnerability_score = EXCLUDED.vulnerability_score,
                adaptation_score = EXCLUDED.adaptation_score,
                geometry = EXCLUDED.geometry,
                updated_at = NOW();
            `;
            await db.execute(sql.raw(q));
            inserted++;
          } catch (err: any) {
            failed++;
            errors.push(`${r.id}: ${err.message?.slice(0, 80)}`);
          }
        }
      }

      res.json({ success: true, inserted, failed, errors: errors.slice(0, 10), country: country.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── ML Service Proxy (Flask on port 8080) ──────────────────────────────────
  const ML_BASE = process.env.ML_SERVICE_URL || 'http://localhost:8080';
  const mlCache = new Map<string, { data: any; ts: number }>();
  const ML_TTL = 30 * 60 * 1000; // 30 minutes

  app.get('/api/ml/short-term/:districtId', async (req, res) => {
    try {
      const { districtId } = req.params;
      const cacheKey = `short-${districtId}`;
      const cached = mlCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < ML_TTL) {
        return res.json(cached.data);
      }

      const { db } = await import("./db");
      const { districts } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      // Look up geometry to compute centroid
      const rows = await db.select({ geometry: districts.geometry })
        .from(districts)
        .where(eq(districts.id, districtId))
        .limit(1);

      const centroid = rows[0]?.geometry ? computeCentroid(rows[0].geometry as any) : null;
      let url = `${ML_BASE}/api/short-term/${districtId}`;
      if (centroid) url += `?lat=${centroid.lat.toFixed(4)}&lon=${centroid.lng.toFixed(4)}`;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timeout);

      if (!resp.ok) {
        return res.status(resp.status).json({ error: 'ML service error' });
      }
      const data = await resp.json();
      mlCache.set(cacheKey, { data, ts: Date.now() });
      res.json(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return res.status(504).json({ error: 'ML service timeout' });
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/ml/country-risk', async (req, res) => {
    try {
      const country = (req.query.country as string) || 'IND';
      const cacheKey = `country-risk-${country}`;
      const cached = mlCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < ML_TTL) {
        return res.json(cached.data);
      }

      const { db } = await import("./db");
      const { districts } = await import("@shared/schema");
      const { eq, isNotNull } = await import("drizzle-orm");

      const rows = await db.select({ id: districts.id, name: districts.name, geometry: districts.geometry })
        .from(districts)
        .where(eq(districts.countryId, country));

      const payload = rows
        .map(r => {
          const c = r.geometry ? computeCentroid(r.geometry as any) : null;
          return c ? { id: r.id, name: r.name, lat: c.lat, lon: c.lng } : null;
        })
        .filter(Boolean);

      if (payload.length === 0) return res.json([]);

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 120000); // 2 min for bulk (5 workers to avoid rate-limit)
      const resp = await fetch(`${ML_BASE}/api/bulk-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) return res.status(resp.status).json({ error: 'ML bulk service error' });
      const data = await resp.json();
      mlCache.set(cacheKey, { data, ts: Date.now() });
      res.json(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return res.status(504).json({ error: 'ML service timeout' });
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/ml/long-term/:districtId', async (req, res) => {
    try {
      const { districtId } = req.params;
      const cacheKey = `long-${districtId}`;
      const cached = mlCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < ML_TTL) {
        return res.json(cached.data);
      }

      const { db } = await import("./db");
      const { districts } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const rows = await db.select({ name: districts.name })
        .from(districts)
        .where(eq(districts.id, districtId))
        .limit(1);

      const districtName = rows[0]?.name || districtId;
      const url = `${ML_BASE}/api/long-term/${encodeURIComponent(districtName)}`;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timeout);

      if (!resp.ok) return res.status(resp.status).json({ error: 'ML service error' });
      const data = await resp.json();
      mlCache.set(cacheKey, { data, ts: Date.now() });
      res.json(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return res.status(504).json({ error: 'ML service timeout' });
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
