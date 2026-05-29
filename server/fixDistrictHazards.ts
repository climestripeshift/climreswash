/**
 * One-time migration: populate districts.hazardScore from the india.json GeoJSON
 * HAZARD field (range 0.02–0.52), which is derived from NDMA district risk atlas data.
 *
 * CVI import and seedIndia do not set hazardScore, so it is null for most districts.
 * This gives the stress-test seeder a real per-district baseline hazard intensity
 * instead of falling back on the exposure proxy.
 *
 * Run once after seeding: npm run fix:district-hazards
 */

import fs from "fs";
import path from "path";
import { db } from "./db";
import { districts } from "@shared/schema";
import { eq } from "drizzle-orm";

const GEO_PATH = path.resolve("client/public/data/india.json");

async function main() {
  if (!fs.existsSync(GEO_PATH)) {
    console.error("india.json not found at:", GEO_PATH);
    process.exit(1);
  }

  const geo = JSON.parse(fs.readFileSync(GEO_PATH, "utf8"));
  const features: Array<{ properties: { ID: string; HAZARD: number } }> = geo.features;

  const valid = features.filter(
    (f) => f.properties.ID != null && typeof f.properties.HAZARD === "number"
  );
  console.log(`Loaded ${valid.length} features with HAZARD values from india.json`);

  let updated = 0;
  let skipped = 0;

  for (const f of valid) {
    const id = String(f.properties.ID);
    const hazard = parseFloat(f.properties.HAZARD.toFixed(4));
    try {
      await db
        .update(districts)
        .set({ hazardScore: hazard })
        .where(eq(districts.id, id));
      updated++;
      if (updated % 100 === 0) process.stdout.write(`  ${updated}/${valid.length} updated…\r`);
    } catch (e: any) {
      console.error(`  Error for district ${id}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. hazardScore set for ${updated} districts. Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
