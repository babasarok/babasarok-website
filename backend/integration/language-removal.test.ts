/**
 * Seam: removing a language from the owner's texts vs. the generated native
 * entities. Vendure's TranslationDiffer (and the bulk variant writer) only
 * upsert languages, so a removed language used to stay live in the shop, and
 * the definition stayed stale forever because the drift check compares every
 * language. The definition sync must converge to exactly the planned
 * languages (option groups, options, variant names).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

const Translations = z.array(z.object({ languageCode: z.string() }));

const BILINGUAL = {
  id: "int-nyelv",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret", en: "Size" },
      presentation: "select",
      visibility: { kind: "always" },
      options: [
        { id: "kicsi", label: { hu: "Kicsi", en: "Small" }, price: 0 },
        { id: "nagy", label: { hu: "Nagy", en: "Large" }, price: 500 },
      ],
    },
  ],
};

function withoutEn(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(withoutEn);
  }

  if (node === null || typeof node !== "object") {
    return node;
  }

  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== "en")
      .map(([key, value]) => [key, withoutEn(value)])
  );
}

const DefinitionStateSchema = z.object({
  productDefinition: z.object({
    nativeProductId: z.number().nullable(),
    syncState: z.string(),
    syncError: z.string().nullable(),
  }),
});

const NativeSchema = z.object({
  product: z.object({
    optionGroups: z.array(
      z.object({
        translations: Translations,
        options: z.array(z.object({ translations: Translations })),
      })
    ),
    variants: z.array(z.object({ translations: Translations })),
  }),
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

async function nativeLanguages(
  nativeProductId: number
): Promise<{ groups: string[]; options: string[]; variants: string[] }> {
  const { product } = await run(
    server.admin,
    `query($id: ID!) { product(id: $id) {
      optionGroups { translations { languageCode } options { translations { languageCode } } }
      variants { translations { languageCode } }
    } }`,
    { id: String(nativeProductId) },
    NativeSchema
  );

  return {
    groups: languagesOf(product.optionGroups.map((group) => group.translations)),
    options: languagesOf(
      product.optionGroups.flatMap((group) => group.options.map((option) => option.translations))
    ),
    variants: languagesOf(product.variants.map((variant) => variant.translations)),
  };
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

describe("removing a language", () => {
  it("drops it from the generated option groups, options and variants", async () => {
    await run(
      server.admin,
      `mutation($definition: JSON!, $name: String!) {
        createProductDefinition(definition: $definition, name: $name) { productId }
      }`,
      { definition: BILINGUAL, name: "Nyelv" },
      z.unknown()
    );
    const nativeProductId = await syncedNativeProductId(BILINGUAL.id);

    expect(await nativeLanguages(nativeProductId)).toEqual({
      groups: ["en", "hu"],
      options: ["en", "hu"],
      variants: ["en", "hu"],
    });

    await run(
      server.admin,
      `mutation($productId: String!, $definition: JSON!) {
        updateProductDefinition(productId: $productId, definition: $definition) { productId }
      }`,
      { productId: BILINGUAL.id, definition: withoutEn(BILINGUAL) },
      z.unknown()
    );
    await syncedNativeProductId(BILINGUAL.id);

    expect(await nativeLanguages(nativeProductId)).toEqual({
      groups: ["hu"],
      options: ["hu"],
      variants: ["hu"],
    });

    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { stale } }`,
      { productId: BILINGUAL.id },
      StaleSchema
    );

    expect(productDefinition.stale).toBe(false);
  });
});
