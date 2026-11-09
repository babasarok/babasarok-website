/**
 * Seam: the definition sync vs. Vendure's own variant model (ADR 0016). A
 * generated product carries exactly one live variant — the definition id as
 * SKU, the native product's name, the base price — however many choices its
 * definition offers; a re-save updates that variant in place, and Vendure's
 * own option-combination check keeps a second variant out.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { materialField, seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

const CONFIGURABLE = {
  id: "int-sok-valasztas",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    materialField("anyag1", "Anyag 1"),
    materialField("anyag2", "Anyag 2"),
    {
      kind: "toggle",
      id: "extrak",
      label: { hu: "Extrák" },
      visibility: { kind: "always" },
      price: 500,
    },
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "select",
      visibility: { kind: "always" },
      options: Array.from({ length: 8 }, (_, index) => ({
        id: `m${index}`,
        label: { hu: `M${index}` },
        price: index * 100,
      })),
    },
  ],
};

const SyncStateSchema = z.object({
  productDefinition: z.object({
    syncState: z.string(),
    syncError: z.string().nullable(),
    nativeProductId: z.number().nullable(),
  }),
});

const ProductSchema = z.object({
  product: z.object({
    optionGroups: z.array(z.object({ code: z.string() })),
    variants: z.array(
      z.object({ id: z.string(), sku: z.string(), name: z.string(), price: z.number() })
    ),
  }),
});

let server: IntegrationServer;

async function settled(): Promise<z.infer<typeof SyncStateSchema>["productDefinition"]> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) {
        productDefinition(productId: $productId) { syncState syncError nativeProductId }
      }`,
      { productId: CONFIGURABLE.id },
      SyncStateSchema
    );

    if (productDefinition.syncState !== "pending") {
      return productDefinition;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${CONFIGURABLE.id} did not sync in time.`);
}

async function nativeProduct(id: number): Promise<z.infer<typeof ProductSchema>["product"]> {
  const { product } = await run(
    server.admin,
    `query($id: ID!) { product(id: $id) { optionGroups { code } variants { id sku name price } } }`,
    { id },
    ProductSchema
  );

  return product;
}

async function saveDefinition(definition: object): Promise<void> {
  await run(
    server.admin,
    `mutation($productId: String!, $definition: JSON!) {
      updateProductDefinition(productId: $productId, definition: $definition) { productId }
    }`,
    { productId: CONFIGURABLE.id, definition },
    z.unknown()
  );
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
  await run(
    server.admin,
    `mutation($definition: JSON!, $name: String!) {
      createProductDefinition(definition: $definition, name: $name) { productId }
    }`,
    { definition: CONFIGURABLE, name: "Sok választás" },
    z.unknown()
  );
});

afterAll(async () => {
  await server.stop();
});

describe("one variant per configurable product", () => {
  it("generates a single variant with no option groups", async () => {
    const state = await settled();

    expect(state.syncState).toBe("synced");

    const product = await nativeProduct(state.nativeProductId ?? 0);

    expect(product.optionGroups).toEqual([]);
    expect(product.variants.map(({ sku, name, price }) => ({ sku, name, price }))).toEqual([
      { sku: CONFIGURABLE.id, name: "Sok választás", price: 1000 },
    ]);
  });

  it("updates the same variant when the definition changes", async () => {
    const before = await nativeProduct((await settled()).nativeProductId ?? 0);

    await saveDefinition({ ...CONFIGURABLE, basePrice: 1500 });

    const state = await settled();
    const after = await nativeProduct(state.nativeProductId ?? 0);

    expect(state.syncState).toBe("synced");
    expect(after.variants).toEqual([{ ...before.variants[0], price: 1500 }]);
  });

  it("cannot gain a second variant through the stock admin API", async () => {
    const nativeProductId = (await settled()).nativeProductId ?? 0;

    await expect(
      run(
        server.admin,
        `mutation($input: [CreateProductVariantInput!]!) { createProductVariants(input: $input) { id } }`,
        {
          input: [
            {
              productId: nativeProductId,
              sku: "masodik",
              price: 1,
              translations: [{ languageCode: "hu", name: "Második" }],
            },
          ],
        },
        z.unknown()
      )
    ).rejects.toThrow();
  });
});
