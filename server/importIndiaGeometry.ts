import { db } from "./db";
import { districts } from "@shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const filePath = path.resolve("client/public/data/india.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const geojson = JSON.parse(raw);
  const features: any[] = geojson.features;

  console.log(`[india-geo] ${features.length} features to import`);

  let updated = 0;
  let failed = 0;

  for (const feature of features) {
    const id = String(feature.properties.ID);
    const geometry = feature.geometry;

    if (!geometry) continue;

    try {
      await db.execute(sql.raw(`
        UPDATE districts
        SET geometry = '${JSON.stringify(geometry).replace(/'/g, "''")}'::jsonb,
            updated_at = NOW()
        WHERE id = '${id}';
      `));
      updated++;
    } catch (err: any) {
      console.error(`[india-geo] Failed id=${id}:`, err.message?.slice(0, 80));
      failed++;
    }

    if (updated % 100 === 0 && updated > 0) {
      console.log(`[india-geo] ${updated}/${features.length} done...`);
    }
  }

  console.log(`\n[india-geo] Done. ✓ ${updated} updated | ✗ ${failed} failed`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
