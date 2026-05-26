/**
 * One-time migration: update district.stateId from the GeoJSON-derived
 * districtStateMap.json, which has correct state names for all 735 Indian districts.
 * The DB schema defaults stateId to 'RJ' so all seeded Indian districts are wrong.
 *
 * Run once after seeding: npm run fix:district-states
 */

import fs from "fs";
import path from "path";
import { db } from "./db";
import { districts } from "@shared/schema";
import { eq } from "drizzle-orm";

const MAP_PATH = path.resolve("client/public/data/districtStateMap.json");

interface DistrictEntry {
  state: string;
  name: string;
}

async function main() {
  if (!fs.existsSync(MAP_PATH)) {
    console.error("districtStateMap.json not found at:", MAP_PATH);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(MAP_PATH, "utf8")) as Record<string, DistrictEntry>;
  const entries = Object.entries(raw);
  console.log(`Loaded ${entries.length} district mappings from districtStateMap.json`);

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [id, { state, name }] of entries) {
    try {
      const result = await db
        .update(districts)
        .set({ stateId: state })
        .where(eq(districts.id, id));
      updated++;
      if (updated % 100 === 0) {
        process.stdout.write(`  ${updated}/${entries.length} updated…\r`);
      }
    } catch (e: any) {
      errors.push(`${id} (${name}): ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
  if (errors.length) {
    console.log("Errors:", errors.slice(0, 10).join("\n"));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
