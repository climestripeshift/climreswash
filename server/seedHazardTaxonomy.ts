/**
 * One-time seed: populate hazard_taxonomy and hazard_interaction_matrix tables.
 *
 * Idempotent — re-running is safe (upsert on PK).
 * Run with: npm run seed:hazard-taxonomy
 *
 * This is also called automatically inside computeMultiHazardProjections()
 * so users do not need to run it separately.
 */

import { db } from "./db";
import { hazardTaxonomy, hazardInteractionMatrix } from "@shared/schema";
import {
  MULTI_HAZARDS,
  HAZARD_LABELS,
  HAZARD_SHORT,
  HAZARD_CATEGORY,
  GEOGRAPHIC_SCOPE_DISPLAY,
  HAZARD_DESCRIPTIONS,
  HAZARD_SOURCES,
  HAZARD_WEIGHTS_8,
  INTERACTION_DATA,
} from "./multiHazardConfig";
import { sql } from "drizzle-orm";

export async function seedHazardTaxonomy(): Promise<void> {
  // ── Taxonomy rows ───────────────────────────────────────────────────────────
  const taxRows = MULTI_HAZARDS.map((id, idx) => ({
    id,
    name:            HAZARD_LABELS[id],
    shortCode:       HAZARD_SHORT[id],
    category:        HAZARD_CATEGORY[id],
    geographicScope: GEOGRAPHIC_SCOPE_DISPLAY[id],
    description:     HAZARD_DESCRIPTIONS[id],
    dataSource:      HAZARD_SOURCES[id],
    defaultWeight:   HAZARD_WEIGHTS_8[id],
    sortOrder:       idx,
  }));

  await db
    .insert(hazardTaxonomy)
    .values(taxRows)
    .onConflictDoUpdate({
      target: hazardTaxonomy.id,
      set: {
        name:            sql`excluded.name`,
        shortCode:       sql`excluded.short_code`,
        category:        sql`excluded.category`,
        geographicScope: sql`excluded.geographic_scope`,
        description:     sql`excluded.description`,
        dataSource:      sql`excluded.data_source`,
        defaultWeight:   sql`excluded.default_weight`,
        sortOrder:       sql`excluded.sort_order`,
      },
    });

  console.log(`  Seeded ${taxRows.length} hazard taxonomy rows.`);

  // ── Interaction matrix rows ─────────────────────────────────────────────────
  const intRows = INTERACTION_DATA.map((e) => ({
    hazardIdI:       e.i,
    hazardIdJ:       e.j,
    interactionType: e.type,
    qualitativeCode: e.code,
    strength:        null as number | null,
    notes:           e.notes || null,
    source:          "Gill & Malamud (2014) Rev. Geophys. 52, 680–722; adapted for Indian hazard context.",
  }));

  // Chunk inserts (56 rows total — no chunking needed, but keep the pattern)
  await db
    .insert(hazardInteractionMatrix)
    .values(intRows)
    .onConflictDoUpdate({
      target: [hazardInteractionMatrix.hazardIdI, hazardInteractionMatrix.hazardIdJ],
      set: {
        interactionType: sql`excluded.interaction_type`,
        qualitativeCode: sql`excluded.qualitative_code`,
        notes:           sql`excluded.notes`,
        source:          sql`excluded.source`,
      },
    });

  console.log(`  Seeded ${intRows.length} hazard interaction rows.`);
}

// ── CLI entry point ───────────────────────────────────────────────────────────
async function main() {
  console.log("Seeding hazard taxonomy + interaction matrix…");
  await seedHazardTaxonomy();
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
