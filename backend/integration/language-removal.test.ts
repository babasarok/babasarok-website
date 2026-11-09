/**
 * Seam: a language leaving the native product vs. the generated variant.
 * Vendure's TranslationDiffer only upserts languages, so a language deleted
 * from the product's names used to stay on the variant, and the definition
 * stayed stale forever because the staleness check compares every language.
 * The sync must converge the variant's names to exactly the product's.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { Pool } from "pg";
import { env } from "../dist/env";

const Translations = z.array(z.object({ languageCode: z.string() }));

const DEFINITION = {
  id: "int-nyelv",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [],
};

const DefinitionStateSchema = z.object({
  productDefinition: z.object({
    nativeProductId: z.number().nullable(),
    syncState: z.string(),
    syncError: z.string().nullable(),
  }),
});

const NativeSchema = z.object({
  product: z.object({ variants: z.array(z.object({ translations: Translations })) }),
});

const StaleSchema = z.object({ productDefinition: z.object({ stale: z.boolean() }) });

let server: IntegrationServer;

function languagesOf(lists: ReadonlyArray<z.infer<typeof Translations>>): string[] {
  return [...new Set(lists.flatMap((list) => list.map((t) => t.languageCode)))].toSorted();
}

async function syncedNativeProductId(productId: string): Promise<number> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { nativeProductId syncState syncError } }`,
      { productId },
      DefinitionStateSchema
    );

    if (productDefinition.syncState === "failed") {
      throw new Error(`sync failed: ${productDefinition.syncError}`);
    }

    if (productDefinition.syncState === "synced" && productDefinition.nativeProductId !== null) {
      return productDefinition.nativeProductId;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("the definition did not sync in time.");
}

async function variantLanguages(nativeProductId: number): Promise<string[]> {
  const { product } = await run(
    server.admin,
    `query($id: ID!) { product(id: $id) { variants { translations { languageCode } } } }`,
    { id: String(nativeProductId) },
    NativeSchema
  );

  return languagesOf(product.variants.map((variant) => variant.translations));
}

async function resave(): Promise<void> {
  await run(
    server.admin,
    `mutation($productId: String!, $definition: JSON!) {
      updateProductDefinition(productId: $productId, definition: $definition) { productId }
    }`,
    { productId: DEFINITION.id, definition: DEFINITION },
    z.unknown()
  );
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

describe("removing a language", () => {
  it("drops it from the generated variant", async () => {
    await run(
      server.admin,
      `mutation($definition: JSON!, $name: String!) {
        createProductDefinition(definition: $definition, name: $name) { productId }
      }`,
      { definition: DEFINITION, name: "Nyelv" },
      z.unknown()
    );

    const nativeProductId = await syncedNativeProductId(DEFINITION.id);

    await run(
      server.admin,
      `mutation($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
      {
        input: {
          id: String(nativeProductId),
          translations: [
            { languageCode: "en", name: "Language", slug: "language", description: "" },
          ],
        },
      },
      z.unknown()
    );
    await resave();
    await syncedNativeProductId(DEFINITION.id);

    expect(await variantLanguages(nativeProductId)).toEqual(["en", "hu"]);

    const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

    try {
      await pool.query(
        `DELETE FROM product_translation WHERE "baseId" = $1 AND "languageCode" = 'en'`,
        [nativeProductId]
      );
    } finally {
      await pool.end();
    }

    await resave();
    await syncedNativeProductId(DEFINITION.id);

    expect(await variantLanguages(nativeProductId)).toEqual(["hu"]);

    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { stale } }`,
      { productId: DEFINITION.id },
      StaleSchema
    );

    expect(productDefinition.stale).toBe(false);
  });
});
