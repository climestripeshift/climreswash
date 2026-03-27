import XLSXPkg from "xlsx";
const XLSX = XLSXPkg as any;
import path from "path";
import fs from "fs";
import { db } from "./db";
import { districts } from "@shared/schema";
import { eq } from "drizzle-orm";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-_]+/g, " ");
}

function parseHazards(primaryEvent: string): string[] {
  if (!primaryEvent || primaryEvent === "No Data Available") return [];
  return primaryEvent
    .split(/[&,]+/)
    .map((h) => h.trim())
    .filter(Boolean);
}

export interface CVIImportResult {
  updated: number;
  notFound: string[];
  total: number;
  errors: string[];
}

export async function importCVIData(): Promise<CVIImportResult> {
  const candidates = [
    path.join(process.cwd(), "attached_assets", "CVI_Complete_India_650_Districts_1774583809434.xlsx"),
    path.join(process.cwd(), "dist", "attached_assets", "CVI_Complete_India_650_Districts_1774583809434.xlsx"),
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    throw new Error("CVI Excel file not found. Please ensure the file is in attached_assets/.");
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Data starts at row index 4 (row 3 is header)
  const rows = raw.slice(4).filter((r) => r[0] != null && r[2]);

  // Load all existing districts for name matching
  const allDistricts = await db.select({ id: districts.id, name: districts.name }).from(districts);
  const nameToId: Record<string, string> = {};
  allDistricts.forEach((d) => {
    nameToId[normalize(d.name)] = d.id;
  });

  const result: CVIImportResult = { updated: 0, notFound: [], total: rows.length, errors: [] };

  for (const row of rows) {
    const districtName: string = String(row[2] || "").trim();
    const stateName: string = String(row[3] || "").trim();
    const primaryEvent: string = String(row[5] || "");
    const exposure: number = typeof row[6] === "number" ? row[6] : parseFloat(row[6]) || 0;
    const sensitivity: number = typeof row[7] === "number" ? row[7] : parseFloat(row[7]) || 0;
    const adaptiveCapacity: number = typeof row[8] === "number" ? row[8] : parseFloat(row[8]) || 0;
    const normalizedVI: number = typeof row[10] === "number" ? row[10] : parseFloat(row[10]) || 0;
    const category: string = String(row[11] || "").trim();

    const key = normalize(districtName);
    const districtId = nameToId[key];

    if (!districtId) {
      result.notFound.push(`${districtName} (${stateName})`);
      continue;
    }

    try {
      const hazards = parseHazards(primaryEvent);
      const updateFields: any = {
        exposureScore: parseFloat(exposure.toFixed(4)),
        vulnerabilityScore: parseFloat(normalizedVI.toFixed(4)),
        adaptationScore: parseFloat(adaptiveCapacity.toFixed(4)),
        vulnerabilityCategory: category === "No Data Available" ? null : category,
        updatedAt: new Date(),
      };
      if (hazards.length > 0) updateFields.climateRisks = hazards;
      await db
        .update(districts)
        .set(updateFields)
        .where(eq(districts.id, districtId));
      result.updated++;
    } catch (e: any) {
      result.errors.push(`${districtName}: ${e.message}`);
    }
  }

  return result;
}
