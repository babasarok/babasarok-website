/**
 * Seam: the translation-drift `setTranslation` mutation vs. the entity
 * services it routes through. The material write replaces the entity
 * wholesale (translations AND colors), product/collection English rows must
 * be created name-first with the hu slug, and definition texts are patched
 * at a JSON path guarded by the expected Hungarian source — each proven
 * against the real admin API. Shipping-method, facet and facet-value writes
 * use the same shape as promotion/collection and are not seeded here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { seedCatalog, type Catalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

const GapsSchema = z.object({
  translationGaps: z.object({
    items: z.array(
      z.object({
        entityType: z.string(),
        entityKey: z.string(),
        field: z.string(),
        huValue: z.string(),
      })
    ),
  }),
});

const SetResultSchema = z.object({ setTranslation: z.boolean() });

const MaterialSchema = z.object({
  materials: z.array(
    z.object({
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

const ProductSchema = z.object({
  product: z
    .object({
      translations: z.array(z.object({ languageCode: z.string(), name: z.string() })),
    })
    .nullable(),
});

const DriftsSchema = z.object({
  translationDrifts: z.object({
    items: z.array(
      z.object({
        entityType: z.string(),
        entityKey: z.string(),
        field: z.string(),
        languageCode: z.string(),
        huFrom: z.string().nullable(),
        huTo: z.string(),
        translatedValue: z.string().nullable(),
        auditEntryId: z.string(),
      })
    ),
  }),
});

let server: IntegrationServer;
let catalog: Catalog;

async function gaps(): Promise<z.output<typeof GapsSchema>["translationGaps"]["items"]> {
  const { translationGaps } = await run(
    server.admin,
    `query { translationGaps(options: { take: 100 }) { items { entityType entityKey field huValue } } }`,
    {},
    GapsSchema
  );

  return translationGaps.items;
}

async function setTranslation(input: {
  entityType: string;
  entityKey: string;
  field: string;
  value: string;
  expectedHu?: string;
}): Promise<boolean> {
  const { setTranslation } = await run(
    server.admin,
    `mutation($input: SetTranslationInput!) { setTranslation(input: $input) }`,
    { input: { ...input, languageCode: "en" } },
    SetResultSchema
  );

  return setTranslation;
}

async function materialOf(
  slug: string
): Promise<z.output<typeof MaterialSchema>["materials"][number]> {
  const { materials } = await run(
    server.admin,
    `query { materials { slug translations { languageCode label } colors { id hex translations { languageCode label } } } }`,
    {},
    MaterialSchema
  );

  const material = materials.find((candidate) => candidate.slug === slug);

  if (material === undefined) {
    throw new Error(`No material ${slug}`);
  }

  return material;
}

async function productOf(id: number): Promise<z.output<typeof ProductSchema>["product"]> {
  const { product } = await run(
    server.admin,
    `query($id: ID!) { product(id: $id) { translations { languageCode name } } }`,
    { id: String(id) },
    ProductSchema
  );

  return product;
}

function gapOf(
  items: Awaited<ReturnType<typeof gaps>>,
  entityType: string,
  entityKey: string,
  field: string
): boolean {
  return items.some(
    (row) => row.entityType === entityType && row.entityKey === entityKey && row.field === field
  );
}

/** The audit rows are written asynchronously after the mutation returns, so
 * the drift scan polls until the finding shows up (or disappears). */
async function pollDrift(
  match: (finding: z.output<typeof DriftsSchema>["translationDrifts"]["items"][number]) => boolean,
  untilVisible: boolean
): Promise<z.output<typeof DriftsSchema>["translationDrifts"]["items"][number] | undefined> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { translationDrifts } = await run(
      server.admin,
      `query { translationDrifts(options: { take: 100 }) { items { entityType entityKey field languageCode huFrom huTo translatedValue auditEntryId } } }`,
      {},
      DriftsSchema
    );

    const finding = translationDrifts.items.find(match);

    if ((finding !== undefined) === untilVisible) {
      return finding;
    }

    await sleep(500);
  }

  return undefined;
}

beforeAll(async () => {
  server = await startServer();
  catalog = await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

describe("translation gap fixing", () => {
  it("lists the seeded catalog's missing English text", async () => {
    const items = await gaps();
    const kendoId = catalog.nativeIds.get("int-kendo");

    expect(kendoId).toBeDefined();
    expect(gapOf(items, "product", String(kendoId), "name")).toBe(true);
    expect(gapOf(items, "material", "int-pamut", "label")).toBe(true);
    expect(gapOf(items, "material", "int-pamut", "colors.feher.label")).toBe(true);
    expect(gapOf(items, "product-definition", "int-takaro", "fields.anyag.label")).toBe(true);
    expect(items.some((row) => row.entityType === "promotion")).toBe(true);
    expect(items.some((row) => row.entityType === "collection")).toBe(true);
  });

  it("refuses a product field whose language row does not exist yet", async () => {
    const kendoId = catalog.nativeIds.get("int-kendo");

    await expect(
      setTranslation({
        entityType: "product",
        entityKey: String(kendoId),
        field: "description",
        value: "Pillow",
      })
    ).rejects.toThrow(/nevet/);
  });

  it("fixes the product name and then its other fields", async () => {
    const kendoId = catalog.nativeIds.get("int-kendo");

    await setTranslation({
      entityType: "product",
      entityKey: String(kendoId),
      field: "name",
      value: "Pillow",
    });
    expect(gapOf(await gaps(), "product", String(kendoId), "name")).toBe(false);

    const product = await productOf(kendoId ?? 0);
    const en = product?.translations.find((translation) => translation.languageCode === "en");
    const hu = product?.translations.find((translation) => translation.languageCode === "hu");

    expect(en?.name).toBe("Pillow");
    expect(hu?.name).toBe("Kendő");

    await setTranslation({
      entityType: "product",
      entityKey: String(kendoId),
      field: "description",
      value: "Hand-embroidered pillow",
    });
    expect(gapOf(await gaps(), "product", String(kendoId), "description")).toBe(false);
  });

  it("fixes material and color labels without losing the stored state", async () => {
    await setTranslation({
      entityType: "material",
      entityKey: "int-pamut",
      field: "label",
      value: "Cotton",
    });

    const material = await materialOf("int-pamut");
    const en = material.translations.find((translation) => translation.languageCode === "en");
    const hu = material.translations.find((translation) => translation.languageCode === "hu");

    expect(en?.label).toBe("Cotton");
    expect(hu?.label).toBe("int-pamut");
    expect(material.colors.map((color) => color.id).toSorted()).toEqual(["feher", "kek"]);
    expect(material.colors.every((color) => color.hex === "#f5f5f5")).toBe(true);
    expect(gapOf(await gaps(), "material", "int-pamut", "label")).toBe(false);

    await setTranslation({
      entityType: "material",
      entityKey: "int-pamut",
      field: "colors.feher.label",
      value: "White",
    });

    const patched = await materialOf("int-pamut");
    const feher = patched.colors.find((color) => color.id === "feher");
    const feherEn = feher?.translations.find((translation) => translation.languageCode === "en");
    const feherHu = feher?.translations.find((translation) => translation.languageCode === "hu");

    expect(feherEn?.label).toBe("White");
    expect(feherHu?.label).toBe("feher");
    expect(gapOf(await gaps(), "material", "int-pamut", "colors.feher.label")).toBe(false);
    expect(gapOf(await gaps(), "material", "int-pamut", "colors.kek.label")).toBe(true);
  });

  it("fixes definition text at a JSON path, guarded by the expected source", async () => {
    await expect(
      setTranslation({
        entityType: "product-definition",
        entityKey: "int-takaro",
        field: "fields.0.label",
        value: "Material",
        expectedHu: "Stale",
      })
    ).rejects.toThrow(/időközben/);

    await setTranslation({
      entityType: "product-definition",
      entityKey: "int-takaro",
      field: "fields.0.label",
      value: "Material",
      expectedHu: "Anyag",
    });

    expect(gapOf(await gaps(), "product-definition", "int-takaro", "fields.0.label")).toBe(false);
  });

  it("fixes promotion and collection names", async () => {
    const PromotionsSchema = z.object({
      promotions: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }),
    });

    const { promotions } = await run(
      server.admin,
      `query { promotions(options: { take: 100 }) { items { id name } } }`,
      {},
      PromotionsSchema
    );

    const promotion = promotions.items.find((item) => item.name === "Alap szett");

    expect(promotion).toBeDefined();
    await setTranslation({
      entityType: "promotion",
      entityKey: promotion?.id ?? "",
      field: "name",
      value: "Basic set",
    });
    expect(gapOf(await gaps(), "promotion", promotion?.id ?? "", "name")).toBe(false);

    const CollectionsSchema = z.object({
      collections: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }),
    });

    const { collections } = await run(
      server.admin,
      `query { collections(options: { take: 100 }) { items { id name } } }`,
      {},
      CollectionsSchema
    );

    const collection = collections.items.find((item) => item.name === "Kiegészítők");

    expect(collection).toBeDefined();
    await setTranslation({
      entityType: "collection",
      entityKey: collection?.id ?? "",
      field: "name",
      value: "Accessories",
    });
    expect(gapOf(await gaps(), "collection", collection?.id ?? "", "name")).toBe(false);
  });
});

describe("translation drift warnings", () => {
  it("flags a Hungarian rename made after the English fix", async () => {
    const kendoId = catalog.nativeIds.get("int-kendo");

    await run(
      server.admin,
      `mutation($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
      {
        input: { id: String(kendoId), translations: [{ languageCode: "hu", name: "Kendő új" }] },
      },
      z.object({ updateProduct: z.object({ id: z.string() }) })
    );

    const finding = await pollDrift(
      (candidate) =>
        candidate.entityType === "product" &&
        candidate.entityKey === String(kendoId) &&
        candidate.field === "name",
      true
    );

    expect(finding?.huFrom).toBe("Kendő");
    expect(finding?.huTo).toBe("Kendő új");
    expect(finding?.translatedValue).toBe("Pillow");
  });

  it("hides a dismissed warning until the next Hungarian change", async () => {
    const kendoId = catalog.nativeIds.get("int-kendo");
    const finding = await pollDrift(
      (candidate) =>
        candidate.entityType === "product" &&
        candidate.entityKey === String(kendoId) &&
        candidate.field === "name",
      true
    );

    expect(finding).toBeDefined();

    await run(
      server.admin,
      `mutation($input: DismissTranslationDriftInput!) { dismissTranslationDrift(input: $input) }`,
      {
        input: {
          entityType: "product",
          entityKey: String(kendoId),
          field: "name",
          languageCode: "en",
          auditEntryId: finding?.auditEntryId,
        },
      },
      z.object({ dismissTranslationDrift: z.boolean() })
    );

    expect(
      await pollDrift(
        (candidate) =>
          candidate.entityType === "product" &&
          candidate.entityKey === String(kendoId) &&
          candidate.field === "name",
        false
      )
    ).toBeUndefined();

    await run(
      server.admin,
      `mutation($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
      {
        input: { id: String(kendoId), translations: [{ languageCode: "hu", name: "Kendő újra" }] },
      },
      z.object({ updateProduct: z.object({ id: z.string() }) })
    );

    const raised = await pollDrift(
      (candidate) =>
        candidate.entityType === "product" &&
        candidate.entityKey === String(kendoId) &&
        candidate.field === "name",
      true
    );

    expect(raised?.huTo).toBe("Kendő újra");
  });

  it("clears the warning when the translation is fixed", async () => {
    const kendoId = catalog.nativeIds.get("int-kendo");

    await setTranslation({
      entityType: "product",
      entityKey: String(kendoId),
      field: "name",
      value: "Shawl",
    });

    expect(
      await pollDrift(
        (candidate) =>
          candidate.entityType === "product" &&
          candidate.entityKey === String(kendoId) &&
          candidate.field === "name",
        false
      )
    ).toBeUndefined();

    const product = await productOf(kendoId ?? 0);
    const en = product?.translations.find((translation) => translation.languageCode === "en");

    expect(en?.name).toBe("Shawl");
  });

  it("flags a definition label changed in Hungarian after its translation", async () => {
    // Loose schemas keep the definition's untyped keys intact for the
    // round-trip; the test only rewrites the one Hungarian label.
    const DefinitionSchema = z.object({
      productDefinition: z.object({
        definition: z.looseObject({
          fields: z.array(
            z.looseObject({ id: z.string(), label: z.looseObject({ hu: z.string() }) })
          ),
        }),
      }),
    });

    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { definition } }`,
      { productId: "int-takaro" },
      DefinitionSchema
    );

    const field = productDefinition.definition.fields.find((candidate) => candidate.id === "anyag");

    if (field === undefined) {
      throw new Error("the seeded anyag field was not found.");
    }

    field.label.hu = "Anyag választó";

    await run(
      server.admin,
      `mutation($productId: String!, $definition: JSON!) { updateProductDefinition(productId: $productId, definition: $definition) { productId } }`,
      { productId: "int-takaro", definition: productDefinition.definition },
      z.object({ updateProductDefinition: z.object({ productId: z.string() }) })
    );

    const finding = await pollDrift(
      (candidate) =>
        candidate.entityType === "product-definition" &&
        candidate.entityKey === "int-takaro" &&
        candidate.field === "fields.anyag.label",
      true
    );

    expect(finding?.huTo).toBe("Anyag választó");
    expect(finding?.translatedValue).toBe("Material");
  });
});
