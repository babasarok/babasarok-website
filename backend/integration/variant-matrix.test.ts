/**
 * Seam: the site's configurator vs. the shop API's variant surface. The site
 * matches the buyer's configuration against the product's full variant
 * matrix, and Vendure's own `Product.variants` field caps at the shop
 * list-query limit (100) with no paging arguments — any matrix larger than
 * that is invisible there (the buyer then sees "ez a beállítás-kombináció
 * jelenleg nem rendelhető"). `productVariants(slug)` must return every
 * variant, so this seeds a definition whose matrix exceeds the limit and
 * asserts the complete set comes back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { materialField, MATERIALS, seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

const BIG_MATRIX = {
  id: "int-nagy-matrix",
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
        price: 0,
      })),
    },
  ],
} as const;

const SyncStateSchema = z.object({
  productDefinition: z.object({ syncState: z.string(), syncError: z.string().nullable() }),
});

const VariantMatrixSchema = z.object({
  productVariants: z.array(
    z.object({
      id: z.string(),
      options: z.array(z.object({ group: z.string(), code: z.string() })),
    })
  ),
});

let server: IntegrationServer;

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);

  await run(
    server.admin,
    `mutation($definition: JSON!, $name: String!) {
      createProductDefinition(definition: $definition, name: $name) { productId }
    }`,
    { definition: BIG_MATRIX, name: "Nagy mátrix" },
    z.object({ createProductDefinition: z.object({ productId: z.string() }) })
  );

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { syncState syncError } }`,
      { productId: BIG_MATRIX.id },
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

  throw new Error(`${BIG_MATRIX.id} did not sync in time.`);
});

afterAll(async () => {
  await server.stop();
});

describe("productVariants(slug)", () => {
  it("returns the full matrix beyond the shop list-query limit", async () => {
    const { productVariants } = await run(
      server.newShopSession(),
      `query($slug: String!) { productVariants(slug: $slug) { id options { group code } } }`,
      { slug: BIG_MATRIX.id },
      VariantMatrixSchema
    );

    const expected = new Set(
      MATERIALS.flatMap((anyag1) =>
        MATERIALS.flatMap((anyag2) =>
          ["nem", "igen"].flatMap((extrak) =>
            BIG_MATRIX.fields[3].options.map((option) =>
              [
                ["anyag1", anyag1],
                ["anyag2", anyag2],
                ["extrak", extrak],
                ["meret", option.id],
              ]
                .map(([group, code]) => `${group}:${code}`)
                .toSorted()
                .join("|")
            )
          )
        )
      )
    );

    expect(productVariants.length).toBe(expected.size);
    expect(productVariants.length).toBeGreaterThan(100);
    expect(new Set(productVariants.map((variant) => variant.id)).size).toBe(productVariants.length);

    const actual = new Set(
      productVariants.map((variant) =>
        variant.options
          .map((option) => `${option.group}:${option.code}`)
          .toSorted()
          .join("|")
      )
    );

    expect([...actual].toSorted()).toEqual([...expected].toSorted());
  });
});
