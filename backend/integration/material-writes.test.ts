/**
 * Seam: material writes vs. the definition-sync queue. Generated products no
 * longer carry anything a material write changes (ADR 0016: one variant, no
 * option groups, no material facets), so a material write must enqueue no
 * definition sync at all — a burst of material writes once queued a sync per
 * referencing product and OOM-ed the worker (the 2026-11-08 incident).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { materialField, seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { env } from "../dist/env";

const REFERENCING = {
  id: "int-anyagot-hasznal",
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
    { definition: REFERENCING, name: "Anyagot használ" },
    CreatedSchema
  );
  productId = created.createProductDefinition.productId;
  await waitForSync();
});

afterAll(async () => {
  await server.stop();
});

describe("material writes", () => {
  it("queue no definition sync for the products referencing the material", async () => {
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

      // The material events dispatch asynchronously (seconds later under the
      // test server): give a fan-out time to land before counting.
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // The owner-save job of the definition's creation only.
      expect(await count()).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
