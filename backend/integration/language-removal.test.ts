/**
 * Seam: removing a language from the owner's texts vs. the generated native
 * entities. Vendure's TranslationDiffer (and the bulk variant writer) only
 * upsert languages, so a removed language used to stay live in the shop, and
 * the definition stayed stale forever because the drift check compares every
 * language. Both syncs must converge to exactly the planned languages: the
 * definition sync (option groups, options, variant names) and the material
 * sync (material and color facet values, the material collection).
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

const FacetsSchema = z.object({
  facets: z.object({
    items: z.array(
      z.object({
        code: z.string(),
        values: z.array(z.object({ code: z.string(), translations: Translations })),
      })
    ),
  }),
});

const CollectionSchema = z.object({
  collection: z.object({ translations: Translations }).nullable(),
});

const MaterialsSchema = z.object({
  materials: z.array(z.object({ id: z.string(), slug: z.string() })),
});

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

async function materialLanguages(
  slug: string
): Promise<{ material: string[]; colors: string[]; collection: string[] }> {
  const { facets } = await run(
    server.admin,
    `query { facets(options: { take: 100 }) { items { code values { code translations { languageCode } } } } }`,
    {},
    FacetsSchema
  );
  const valuesOf = (
    facetCode: string
  ): Array<{ code: string; translations: z.infer<typeof Translations> }> =>
    facets.items.find((facet) => facet.code === facetCode)?.values ?? [];
  const { collection } = await run(
    server.admin,
    `query($slug: String!) { collection(slug: $slug) { translations { languageCode } } }`,
    { slug: `material-${slug}` },
    CollectionSchema
  );

  return {
    material: languagesOf(
      valuesOf("babasarok-material")
        .filter((value) => value.code === slug)
        .map((value) => value.translations)
    ),
    colors: languagesOf(
      valuesOf("babasarok-color")
        .filter((value) => value.code.startsWith(slug))
        .map((value) => value.translations)
    ),
    collection: languagesOf(collection === null ? [] : [collection.translations]),
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

  it("drops it from the material's facet values and collection", async () => {
    const slug = "int-nyelv-anyag";
    const color = (translations: Array<{ languageCode: string; label: string }>): object => ({
      id: "piros",
      hex: "#ff0000",
      translations,
    });

    await run(
      server.admin,
      `mutation($input: MaterialInput!) { createMaterial(input: $input) { slug } }`,
      {
        input: {
          slug,
          translations: [
            { languageCode: "hu", label: "Nyelvi anyag" },
            { languageCode: "en", label: "Language fabric" },
          ],
          colors: [
            color([
              { languageCode: "hu", label: "Piros" },
              { languageCode: "en", label: "Red" },
            ]),
          ],
        },
      },
      z.unknown()
    );

    expect(await materialLanguages(slug)).toEqual({
      material: ["en", "hu"],
      colors: ["en", "hu"],
      collection: ["en", "hu"],
    });

    const { materials } = await run(
      server.admin,
      `query { materials { id slug } }`,
      {},
      MaterialsSchema
    );
    const id = materials.find((material) => material.slug === slug)?.id;

    await run(
      server.admin,
      `mutation($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { slug } }`,
      {
        id,
        input: {
          slug,
          translations: [{ languageCode: "hu", label: "Nyelvi anyag" }],
          colors: [color([{ languageCode: "hu", label: "Piros" }])],
        },
      },
      z.unknown()
    );

    expect(await materialLanguages(slug)).toEqual({
      material: ["hu"],
      colors: ["hu"],
      collection: ["hu"],
    });
  });
});
