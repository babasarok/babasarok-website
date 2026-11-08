/**
 * Seam: the material-write event fan-out vs. the sync queue. A material write
 * queues a definition sync for every product referencing that material, so a
 * bulk material write (a script, not the dashboard's one-at-a-time form) fires
 * N events back to back — without a dedup each event enqueues its own job for
 * the same product, and the sequential worker chews through duplicates (each
 * heavy sync can OOM it; the 2026-11-08 incident burst-queued 36 jobs). A
 * queued not-yet-started job re-reads the definition and materials when it
 * runs, so one pending job covers every material change that lands before it
 * starts: three concurrent material writes must produce a single automatic
 * sync job, i.e. two jobs total for the definition (its owner-save + one).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { materialField, seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { env } from "../dist/env";

const DEDUP_MATRIX = {
  id: "int-dedup-matrix",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    materialField("anyag", "Anyag"),
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "select",
      visibility: { kind: "always" },
      options: Array.from({ length: 8 }, (_, index) => ({
        id: `m${index}`,
        label: { hu: `M${index}` },
        price: 0,
      })),
    },
  ],
} as const;

const CreatedSchema = z.object({
  createProductDefinition: z.object({ productId: z.string() }),
});

const SyncStateSchema = z.object({
  productDefinition: z.object({ syncState: z.string(), syncError: z.string().nullable() }),
});

const MaterialsSchema = z.object({
  materials: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      translations: z.array(z.object({ languageCode: z.string(), label: z.string() })),
      colors: z.array(
        z.object({
          id: z.string(),
          hex: z.string().nullable(),
          translations: z.array(z.object({ languageCode: z.string(), label: z.string() })),
        })
      ),
    })
  ),
});

const UpdatedSchema = z.object({ updateMaterial: z.object({ slug: z.string() }) });

let server: IntegrationServer;
let productId: string;

async function waitForSync(): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { syncState syncError } }`,
      { productId },
      SyncStateSchema
    );

    if (productDefinition.syncState === "failed") {
      throw new Error(`sync failed: ${productDefinition.syncError}`);
    }

    if (productDefinition.syncState === "synced") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("the definition did not sync in time.");
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);

  const created = await run(
    server.admin,
    `mutation($definition: JSON!, $name: String!) {
      createProductDefinition(definition: $definition, name: $name) { productId }
    }`,
    { definition: DEDUP_MATRIX, name: "Dedup mátrix" },
    CreatedSchema
  );
  productId = created.createProductDefinition.productId;
  await waitForSync();
});

afterAll(async () => {
  await server.stop();
});

describe("material-write sync fan-out", () => {
  it("three concurrent material writes queue one automatic sync", async () => {
    const { materials } = await run(
      server.admin,
      `query { materials { id slug translations { languageCode label } colors { id hex translations { languageCode label } } } }`,
      {},
      MaterialsSchema
    );
    const material = materials.find((m) => m.slug === "int-pamut");

    if (material === undefined) {
      throw new Error("int-pamut was not seeded.");
    }

    // A label change is what makes the update variant-relevant (a no-op write
    // publishes no event) — on prod this was the en labels being added.
    const input = {
      slug: material.slug,
      translations: material.translations.map((t) => ({
        ...t,
        label: t.languageCode === "hu" ? `${t.label} (módosítva)` : t.label,
      })),
      colors: material.colors.map((c) => ({
        id: c.id,
        hex: c.hex ?? undefined,
        translations: c.translations.map((t) => ({ ...t })),
      })),
    };

    // Three events back to back: inside the job queue's 200 ms poll interval,
    // so the first automatic job is still not started when the other two fire.
    await Promise.all(
      Array.from({ length: 3 }, () =>
        run(
          server.admin,
          `mutation($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { slug } }`,
          { id: material.id, input },
          UpdatedSchema
        )
      )
    );

    await waitForSync();

    const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

    try {
      const count = async (): Promise<number> => {
        const result = await pool.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM job_record
           WHERE "queueName" = 'product-definition-sync' AND (data::jsonb)->>'productId' = $1`,
          [productId]
        );
        return result.rows.at(0)?.n ?? 0;
      };
      const pending = async (): Promise<number> => {
        const result = await pool.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM job_record
           WHERE "queueName" = 'product-definition-sync' AND state IN ('PENDING', 'RETRYING')
             AND (data::jsonb)->>'productId' = $1`,
          [productId]
        );
        return result.rows.at(0)?.n ?? 0;
      };

      // The material events dispatch asynchronously (seconds later under the
      // test server), so wait until at least one automatic job has landed and
      // the product's queue slice is stable and drained before counting.
      let last = -1;

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const total = await count();

        if (total >= 2 && total === last && (await pending()) === 0) {
          break;
        }

        last = total;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // The owner-save job plus exactly one automatic job.
      expect(await count()).toBe(2);
    } finally {
      await pool.end();
    }
  });
});
