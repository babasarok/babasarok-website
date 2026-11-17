/**
 * Seam: the ready-made migration (ADR 0018) vs. a production-like configurator
 * product. A synced product with a definition ("Babafészek szett", a single
 * choice field and its base price on the variant) must end as a ready-made
 * product: the definition is gone, the variant's inventory tracking is
 * re-enabled with stock 1, the shop API serves it without a definition, a
 * basket line on it prices from the variant, and a re-run changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { READY_MADE_BABAFESZEK_SZETT_STATEMENTS } from "../dist/migrations/1794800000000-ready-made-babafeszek-szett";
import { env } from "../dist/env";
import { run, startServer, type IntegrationServer } from "./harness";
import { addLine, newShopper } from "./shop";

const DEFINITION_ID = "babafeszek-szett";
const SKU = "babafeszek-szett";
const BASE_PRICE = 21_500;

const DefinitionInput = {
  id: DEFINITION_ID,
  basePrice: BASE_PRICE,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "select",
      visibility: { kind: "always" },
      options: [{ id: "normal", label: { hu: "Normál" }, price: 0 }],
    },
  ],
} as const;

const CreatedSchema = z.object({
  createProductDefinition: z.object({ productId: z.string() }),
});

const SyncStateSchema = z.object({
  productDefinition: z.object({ nativeProductId: z.number().nullable(), syncState: z.string() }),
});

const VariantRow = z.object({
  trackInventory: z.string(),
  stockOnHand: z.number(),
});

const ShopProductSchema = z.object({
  product: z
    .object({
      enabled: z.boolean(),
      name: z.string(),
      productDefinition: z.unknown(),
      variants: z.array(z.object({ priceWithTax: z.number(), stockLevel: z.string() })),
    })
    .nullable(),
});

let server: IntegrationServer;

async function runMigration(): Promise<void> {
  const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const statement of READY_MADE_BABAFESZEK_SZETT_STATEMENTS) {
      await client.query(statement);
    }

    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
}

async function variantState(): Promise<z.output<typeof VariantRow>> {
  const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

  try {
    const rows = z.array(VariantRow).parse(
      (
        await pool.query(
          `SELECT v."trackInventory", sl."stockOnHand"
           FROM product_variant v
           LEFT JOIN stock_level sl ON sl."productVariantId" = v.id
           WHERE v.sku = $1 AND v."deletedAt" IS NULL`,
          [SKU]
        )
      ).rows
    );

    const row = rows.at(0);

    if (row === undefined) {
      throw new Error(`No live variant with sku ${SKU}.`);
    }

    return row;
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  server = await startServer();

  await run(
    server.admin,
    `mutation($definition: JSON!, $name: String!) {
      createProductDefinition(definition: $definition, name: $name) { productId }
    }`,
    { definition: DefinitionInput, name: "Babafészek szett" },
    CreatedSchema
  );

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const data = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { nativeProductId syncState } }`,
      { productId: DEFINITION_ID },
      SyncStateSchema
    );

    if (data.productDefinition.syncState === "failed") {
      throw new Error("The seeded definition failed to sync.");
    }

    if (
      data.productDefinition.syncState === "synced" &&
      data.productDefinition.nativeProductId !== null
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("The seeded definition did not sync in time.");
}, 300_000);

afterAll(async () => {
  await server.stop();
});

describe("ready-made migration", () => {
  it("turns the configurator product into a ready-made product", async () => {
    // Production-like before-state: the sync left the variant untracked with
    // no stock and the definition in place.
    expect(await variantState()).toEqual({ trackInventory: "FALSE", stockOnHand: 0 });

    await runMigration();

    expect(await variantState()).toEqual({ trackInventory: "INHERIT", stockOnHand: 1 });

    const data = await run(
      server.newShopSession(),
      `query($slug: String!) { product(slug: $slug) { enabled name productDefinition variants { priceWithTax stockLevel } } }`,
      { slug: "babafeszek-szett" },
      ShopProductSchema
    );

    expect(data.product).toMatchObject({
      enabled: true,
      name: "Babafészek szett",
      productDefinition: null,
      variants: [{ priceWithTax: BASE_PRICE, stockLevel: "LOW_STOCK" }],
    });
  });

  it("prices a ready-made basket line from the variant", async () => {
    const shopper = newShopper(server);
    const order = await addLine(shopper, { sku: SKU });

    expect(order.lines[0]?.unitPriceWithTax).toBe(BASE_PRICE);
    expect(order.lines[0]?.invalidReason).toBeNull();
  });

  it("changes nothing on a re-run", async () => {
    await runMigration();

    expect(await variantState()).toEqual({ trackInventory: "INHERIT", stockOnHand: 1 });
  });
});
