/**
 * Seam: the placeholder-retirement migration vs. placed orders on a
 * placeholder. The `[placeholder]` product leaves the dashboard's product
 * list, a placed order whose line references it reads exactly as before, and
 * a re-run changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { env } from "../dist/env";
import { RETIRE_PLACEHOLDER_PRODUCTS_STATEMENTS } from "../dist/migrations/1794500000000-retire-placeholder-products";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { takaro } from "./lines";
import { addLine, completeCheckout, newShopper, transitionTo } from "./shop";

const PLACEHOLDER_SLUG = "placeholder-int-teszt-termek";
const PLACEHOLDER_NAME = "[placeholder] Int teszt termék";

const ORDER_QUERY = `
  query($code: String!) {
    orders(options: { filter: { code: { eq: $code } } }) { items {
      code state createdAt updatedAt totalQuantity
      subTotalWithTax shippingWithTax totalWithTax
      lines {
        id quantity unitPriceWithTax linePriceWithTax
        productVariant { id name sku product { id name } }
        customFields { title configText detailsJson quotedUnitPrice quotedLineTotal lengthCm selections }
      }
    } }
  }
`;

let server: IntegrationServer;
let pool: Pool;
let orderCode: string;

async function createPlaceholderVariant(): Promise<string> {
  const { createProduct } = await run(
    server.admin,
    `mutation($input: CreateProductInput!) { createProduct(input: $input) { id } }`,
    {
      input: {
        translations: [
          { languageCode: "hu", name: PLACEHOLDER_NAME, slug: PLACEHOLDER_SLUG, description: "" },
        ],
      },
    },
    z.object({ createProduct: z.object({ id: z.string() }) })
  );

  const { createProductVariants } = await run(
    server.admin,
    `mutation($input: [CreateProductVariantInput!]!) { createProductVariants(input: $input) { id } }`,
    {
      input: [
        {
          productId: createProduct.id,
          sku: "placeholder-Int-Teszt-Termek",
          price: 0,
          translations: [{ languageCode: "hu", name: PLACEHOLDER_NAME }],
        },
      ],
    },
    z.object({ createProductVariants: z.array(z.object({ id: z.string() })).length(1) })
  );

  return createProductVariants[0]?.id ?? "";
}

async function placedOrder(): Promise<unknown> {
  const { orders } = await run(
    server.admin,
    ORDER_QUERY,
    { code: orderCode },
    z.object({ orders: z.object({ items: z.array(z.unknown()).length(1) }) })
  );

  return orders.items[0];
}

async function productSlugs(): Promise<string[]> {
  const { products } = await run(
    server.admin,
    `query { products(options: { take: 100 }) { items { slug } } }`,
    {},
    z.object({ products: z.object({ items: z.array(z.object({ slug: z.string() })) }) })
  );

  return products.items.map((product) => product.slug);
}

async function runMigration(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const statement of RETIRE_PLACEHOLDER_PRODUCTS_STATEMENTS) {
      await client.query(statement);
    }

    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
  pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

  const buyer = newShopper(server);

  await addLine(buyer, takaro({ material: "int-pamut" }));
  await completeCheckout(buyer);

  const placed = await transitionTo(buyer, "ArrangingPayment");

  if (!("order" in placed)) {
    throw new Error(`placing the order was refused: ${placed.refusal}`);
  }

  orderCode = placed.order.code;

  await pool.query(
    `UPDATE order_line SET "productVariantId" = $1
     WHERE "orderId" = (SELECT id FROM "order" WHERE code = $2)`,
    [await createPlaceholderVariant(), orderCode]
  );
});

afterAll(async () => {
  await server.stop();
  await pool.end();
});

describe("the placeholder-retirement migration", () => {
  it("drops the placeholder from the product list and leaves its placed order as it was", async () => {
    const before = await placedOrder();

    expect(before).toMatchObject({
      state: "ArrangingPayment",
      lines: [{ productVariant: { product: { name: PLACEHOLDER_NAME } } }],
    });
    expect(await productSlugs()).toContain(PLACEHOLDER_SLUG);

    await runMigration();

    const slugs = await productSlugs();

    expect(slugs).not.toContain(PLACEHOLDER_SLUG);
    expect(slugs).toContain("int-takaro");
    expect(await placedOrder()).toEqual(before);

    await runMigration();

    expect(await productSlugs()).toEqual(slugs);
    expect(await placedOrder()).toEqual(before);
  });
});
