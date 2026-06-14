/**
 * Adaptation Engine — Node.js wrapper for the Python climate-adapt-risk batch runner.
 *
 * Fetches all districts from the DB, serialises their WASH/hazard indicators to JSON,
 * spawns run_batch.py via python3, and persists the DistrictRisk + recommendations
 * back into adapt_projections via storage.bulkInsertAdaptProjections.
 *
 * The Python script runs with allow_uncalibrated=True (demo mode). Outputs are
 * illustrative — ENSO coefficients and biophysical conditioners are placeholders.
 */

import { spawn } from "child_process";
import path from "path";
import { storage } from "./storage.js";
import type { InsertAdaptProjection } from "@shared/schema";

// process.cwd() = project root in both dev (tsx) and prod (node dist/index.cjs)
const PYTHON_SCRIPT = path.resolve(process.cwd(), "climate_adapt_risk/run_batch.py");

interface PythonResult {
  districtId: string;
  effectiveDrought?: number;
  effectiveFlood?: number;
  compoundHazard?: number;
  hazardNorm?: number;
  riskScore?: number;
  impactPeople?: number;
  impactLivelihood?: number;
  recommendations?: unknown[];
  error?: string;
}

function runPython(payload: object[]): Promise<PythonResult[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [PYTHON_SCRIPT], {
      cwd: path.dirname(PYTHON_SCRIPT),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const input = JSON.stringify(payload);
    child.stdin.write(input, "utf8");
    child.stdin.end();

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as PythonResult[]);
      } catch {
        reject(new Error(`Python output not valid JSON: ${stdout.slice(0, 300)}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn python3: ${err.message}. Ensure python3 is on PATH.`));
    });
  });
}

export async function computeAdaptProjections(): Promise<{ districts: number; rows: number }> {
  const allDistricts = await storage.getAllDistricts();
  if (!allDistricts.length) throw new Error("No districts found — seed districts first.");

  const payload = allDistricts.map((d) => ({
    districtId:                 d.id,
    name:                       d.name,
    hazardScore:                d.hazardScore,
    exposureScore:              d.exposureScore,
    vulnerabilityScore:         d.vulnerabilityScore,
    adaptationScore:            d.adaptationScore,
    waterAccessPercent:         d.waterAccessPercent,
    toiletCoveragePercent:      d.toiletCoveragePercent,
    handwashingFacilityPercent: d.handwashingFacilityPercent,
    infantMortalityRate:        d.infantMortalityRate,
    malnutritionStunting:       d.malnutritionStunting,
    malnutritionWasting:        d.malnutritionWasting,
    maternalMortalityRatio:     d.maternalMortalityRatio,
    population:                 d.population,
  }));

  const results = await runPython(payload);

  const rows: InsertAdaptProjection[] = results
    .filter((r): r is Required<Omit<PythonResult, "error">> => !r.error && r.riskScore != null)
    .map((r) => ({
      districtId:       r.districtId,
      effectiveDrought: r.effectiveDrought,
      effectiveFlood:   r.effectiveFlood,
      compoundHazard:   r.compoundHazard,
      hazardNorm:       r.hazardNorm,
      riskScore:        r.riskScore,
      impactPeople:     r.impactPeople,
      impactLivelihood: r.impactLivelihood,
      recommendations:  (r.recommendations ?? []) as InsertAdaptProjection["recommendations"],
    }));

  await storage.bulkInsertAdaptProjections(rows);

  const errors = results.filter((r) => r.error);
  if (errors.length) {
    console.warn(`[adaptEngine] ${errors.length} districts failed:`, errors.slice(0, 3).map((e) => e.error));
  }

  return { districts: allDistricts.length, rows: rows.length };
}
