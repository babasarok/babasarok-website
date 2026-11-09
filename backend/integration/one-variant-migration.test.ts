/**
 * Seam: the ADR 0016 migration vs. orders already in the database. A product
 * still carrying a variant matrix (option group, per-combination variants)
 * must end with one live variant; an active basket line on a matrix variant
 * moves onto it with its stored price and selections intact and keeps
 * pricing the same afterwards; a placed order keeps its (now soft-deleted)
 * variant and still loads in the admin API; and a re-run changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { ONE_VARIANT_PER_PRODUCT_STATEMENTS } from "../dist/migrations/1794400000000-one-variant-per-product";
import { env } from "../dist/env";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { elavulo } from "./lines";
import {
  activeOrder,
  addLine,
  adjustLine,
  completeCheckout,
  newShopper,
  transitionTo,
  type Order,
} from "./shop";

const PAMUT = { material: "int-pamut" } as const;

const OptionGroupSchema = z.object({
  createProductOptionGroup: z.object({
    id: z.string(),
    options: z.array(z.object({ id: z.string(), code: z.string() })),
  }),
});

const VariantsSchema = z.object({
  createProductVariants: z.array(z.object({ id: z.string() })),
});

const NativeIdSchema = z.object({
  productDefinition: z.object({ nativeProductId: z.number() }),
});

const ProductSchema = z.object({
  product: z.object({
    optionGroups: z.array(z.object({ id: z.string() })),
    variants: z.array(z.object({ id: z.string(), sku: z.string(), price: z.number() })),
  }),
});

const PlacedSchema = z.object({
  orders: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        lines: z.array(z.object({ productVariant: z.object({ sku: z.string() }) })),
      })
    ),
  }),
});

let server: IntegrationServer;
let nativeProductId: number;

async function runMigration(): Promise<void> {
  const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const statement of ONE_VARIANT_PER_PRODUCT_STATEMENTS) {
      await client.query(statement);
    }

    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
}

async function nativeProduct(): Promise<z.infer<typeof ProductSchema>["product"]> {
  const { product } = await run(
    server.admin,
    `query($id: ID!) { product(id: $id) { optionGroups { id } variants { id sku price } } }`,
    { id: nativeProductId },
    ProductSchema
  );

  return product;
}

/** Recreates the pre-ADR-0016 shape: an option group and a variant per size. */
async function giveProductAMatrix(): Promise<void> {
  const { createProductOptionGroup } = await run(
    server.admin,
    `mutation($input: CreateProductOptionGroupInput!) {
      createProductOptionGroup(input: $input) { id options { id code } }
    }`,
    {
      input: {
        code: "int-elavulo-meret",
        translations: [{ languageCode: "hu", name: "Méret" }],
        options: ["kicsi", "nagy"].map((code) => ({
          code,
          translations: [{ languageCode: "hu", name: code }],
        })),
      },
    },
    OptionGroupSchema
  );

  await run(
    server.admin,
    `mutation($productId: ID!, $optionGroupId: ID!) {
      addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) { id }
    }`,
    { productId: nativeProductId, optionGroupId: createProductOptionGroup.id },
    z.unknown()
  );

  const optionId = (code: string): string =>
    createProductOptionGroup.options.find((option) => option.code === code)?.id ?? "";

  await run(
    server.admin,
    `mutation($input: [CreateProductVariantInput!]!) { createProductVariants(input: $input) { id } }`,
    {
      input: ["kicsi", "nagy"].map((code) => ({
        productId: nativeProductId,
        sku: `int-elavulo--${code}`,
        price: code === "kicsi" ? 6000 : 7000,
        trackInventory: "FALSE",
        optionIds: [optionId(code)],
        translations: [{ languageCode: "hu", name: `Elavuló ${code}` }],
      })),
    },
    VariantsSchema
  );
}

function pricesOf(order: Order): unknown {
  return {
    total: order.totalWithTax,
    lines: order.lines.map((line) => [line.unitPriceWithTax, line.customFields.selections]),
  };
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);

  const { productDefinition } = await run(
    server.admin,
    `query { productDefinition(productId: "int-elavulo") { nativeProductId } }`,
    {},
    NativeIdSchema
  );

  nativeProductId = productDefinition.nativeProductId;
  await giveProductAMatrix();
});

afterAll(async () => {
  await server.stop();
});

describe("the one-variant migration", () => {
  it("keeps one variant, moves active lines onto it and leaves placed orders intact", async () => {
    const placedBuyer = newShopper(server);
    const placedSpec = { ...elavulo(PAMUT, "kicsi"), sku: "int-elavulo--kicsi" };

    await addLine(placedBuyer, placedSpec);
    await completeCheckout(placedBuyer);

    const placed = await transitionTo(placedBuyer, "ArrangingPayment");

    if (!("order" in placed)) {
      throw new Error(`placing the order was refused: ${placed.refusal}`);
    }

    const basketBuyer = newShopper(server);

    await addLine(basketBuyer, { ...elavulo(PAMUT, "nagy", 2), sku: "int-elavulo--nagy" });

    const before = await activeOrder(basketBuyer);

    expect((await nativeProduct()).variants).toHaveLength(3);

    await runMigration();

    const product = await nativeProduct();

    expect(product.optionGroups).toEqual([]);
    expect(product.variants.map(({ sku, price }) => ({ sku, price }))).toEqual([
      { sku: "int-elavulo", price: 6000 },
    ]);

    const after = await activeOrder(basketBuyer);

    expect(after.lines.map((line) => line.productVariant.sku)).toEqual(["int-elavulo"]);
    expect(pricesOf(after)).toEqual(pricesOf(before));

    const adjusted = await adjustLine(basketBuyer, after.lines[0]?.id ?? "", 3);

    expect(adjusted.lines[0]?.unitPriceWithTax).toBe(before.lines[0]?.unitPriceWithTax);

    const { orders } = await run(
      server.admin,
      `query($code: String!) {
        orders(options: { filter: { code: { eq: $code } } }) {
          items { id lines { productVariant { sku } } }
        }
      }`,
      { code: placed.order.code },
      PlacedSchema
    );

    expect(orders.items[0]?.lines.map((line) => line.productVariant.sku)).toEqual([
      "int-elavulo--kicsi",
    ]);

    await run(
      server.admin,
      `query($id: ID!) { order(id: $id) { id lines { productVariant { name sku } } } }`,
      { id: orders.items[0]?.id },
      z.object({ order: z.object({ id: z.string() }) })
    );

    await runMigration();

    expect(await nativeProduct()).toEqual(product);
    expect((await activeOrder(basketBuyer)).lines[0]?.productVariant.sku).toBe("int-elavulo");
  });
});
