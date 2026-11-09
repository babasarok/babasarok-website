/**
 * Seam: the placeholder-retirement migration vs. the legacy orders that
 * reference the placeholders. The `[placeholder]` products (created by the
 * removed quote-order path, ADR 0007 decision 3) must leave the admin product
 * list and the shop API, while every order that references them renders in
 * the admin API exactly as before: the dashboard reads the line's variant
 * (id/name/sku) and its product name, the stored unit prices and the stored
 * line custom fields, so those must not move. A definition-backed product and
 * its order are untouched. A re-run changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { env } from "../dist/env";
import { RETIRE_PLACEHOLDER_PRODUCTS_STATEMENTS } from "../dist/migrations/1794500000000-retire-placeholder-products";
import { dashboardOrders, type DashboardOrder } from "./dashboard-order";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { takaro } from "./lines";
import {
  addLine,
  completeCheckout,
  newShopper,
  setCustomer,
  transitionTo,
  type Shopper,
} from "./shop";

const PLACEHOLDER_SLUG = "placeholder-int-teszt-termek";
const PLACEHOLDER_SKU = "placeholder-Int-Teszt-Termek";
const PLACEHOLDER_NAME = "[placeholder] Int teszt termék";
const TAKARO_SKU = "int-takaro";

const ProductListSchema = z.object({
  products: z.object({ items: z.array(z.object({ slug: z.string() })) }),
});

const VariantListSchema = z.object({
  productVariants: z.object({
    items: z.array(
      z.object({ id: z.string(), sku: z.string(), enabled: z.boolean(), price: z.number() })
    ),
  }),
});

function refused(result: { __typename: string } & Record<string, unknown>, what: string): void {
  if (result.__typename !== "Order") {
    throw new Error(`${what} failed: ${JSON.stringify(result)}`);
  }
}

/** The product + variant the removed quote-order path created for an unseen slug. */
async function createPlaceholder(server: IntegrationServer): Promise<string> {
  const { createProduct } = await run(
    server.admin,
    `mutation($input: CreateProductInput!) { createProduct(input: $input) { id } }`,
    {
      input: {
        enabled: true,
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
          sku: PLACEHOLDER_SKU,
          price: 0,
          trackInventory: "FALSE",
          translations: [{ languageCode: "hu", name: PLACEHOLDER_NAME }],
        },
      ],
    },
    z.object({ createProductVariants: z.array(z.object({ id: z.string() })) })
  );

  return createProductVariants[0]?.id ?? "";
}

async function addLegacyLine(
  shopper: Shopper,
  spec: {
    variantId: string;
    quantity: number;
    title: string;
    configText: string;
    detailsJson: string;
    quotedUnitPrice: number;
    quotedLineTotal: number;
  }
): Promise<void> {
  const result = await run(
    shopper.client,
    `mutation($variantId: ID!, $quantity: Int!, $customFields: OrderLineCustomFieldsInput) {
      addItemToOrder(productVariantId: $variantId, quantity: $quantity, customFields: $customFields) {
        __typename ... on Order { code } ... on ErrorResult { errorCode message }
      }
    }`,
    {
      variantId: spec.variantId,
      quantity: spec.quantity,
      customFields: {
        title: spec.title,
        configText: spec.configText,
        detailsJson: spec.detailsJson,
        quotedUnitPrice: spec.quotedUnitPrice,
        quotedLineTotal: spec.quotedLineTotal,
      },
    },
    z.object({
      addItemToOrder: z.object({ __typename: z.string() }).loose(),
    })
  );

  refused(result.addItemToOrder, "addItemToOrder");
}

async function setLegacyAddress(shopper: Shopper): Promise<void> {
  const result = await run(
    shopper.client,
    `mutation($input: CreateAddressInput!) {
      setOrderShippingAddress(input: $input) { ... on Order { code } ... on ErrorResult { errorCode message } }
    }`,
    {
      input: {
        fullName: "Kovács Béla",
        streetLine1: "3894 Telkibánya, Fő u. 1.",
        phoneNumber: "+36301234567",
        countryCode: "HU",
      },
    },
    z.object({
      setOrderShippingAddress: z.union([
        z.object({ code: z.string() }),
        z.object({ errorCode: z.string(), message: z.string() }),
      ]),
    })
  );
  const address = result.setOrderShippingAddress;

  if (!("code" in address)) {
    throw new Error(`setOrderShippingAddress failed: ${address.message}`);
  }
}

/** The delivery and total the legacy flow carried as order custom fields. */
async function setLegacyOrderFields(shopper: Shopper, transactionId: string): Promise<void> {
  const result = await run(
    shopper.client,
    `mutation($input: UpdateOrderInput!) {
      setOrderCustomFields(input: $input) { ... on Order { code } ... on ErrorResult { errorCode message } }
    }`,
    {
      input: {
        customFields: {
          message: "Kérem hívjanak.",
          deliveryMethodName: "Házhozszállítás",
          deliveryPrice: 1490,
          deliveryFree: false,
          orderTotal: 10_490,
          setDiscountSummary: "Alap szett −1 500 Ft",
          termsAccepted: true,
          submissionTransactionId: transactionId,
        },
      },
    },
    z.object({
      setOrderCustomFields: z.union([
        z.object({ code: z.string() }),
        z.object({ errorCode: z.string(), message: z.string() }),
      ]),
    })
  );
  const fields = result.setOrderCustomFields;

  if (!("code" in fields)) {
    throw new Error(`setOrderCustomFields failed: ${fields.message}`);
  }
}

async function legacyQuoteOrder(
  server: IntegrationServer,
  variantId: string,
  transactionId: string
): Promise<string> {
  const shopper = newShopper(server);

  await addLegacyLine(shopper, {
    variantId,
    quantity: 2,
    title: "Hordozó takaró",
    configText: "Anyag: gyapjú\nMéret: 130×50",
    detailsJson: JSON.stringify({ meret: "130×50" }),
    quotedUnitPrice: 4500,
    quotedLineTotal: 9000,
  });
  await setCustomer(shopper, `vevo-${transactionId}@example.com`);
  await setLegacyAddress(shopper);
  await setLegacyOrderFields(shopper, transactionId);

  const placed = await transitionTo(shopper, "ArrangingPayment");

  if (!("order" in placed)) {
    throw new Error(`the legacy order was refused: ${placed.refusal}`);
  }

  return placed.order.code;
}

async function cancelOrder(server: IntegrationServer, code: string): Promise<void> {
  const { orders } = await run(
    server.admin,
    `query($code: String!) {
      orders(options: { filter: { code: { eq: $code } } }) { items { id } }
    }`,
    { code },
    z.object({ orders: z.object({ items: z.array(z.object({ id: z.string() })) }) })
  );
  const id = orders.items[0]?.id;

  if (id === undefined) {
    throw new Error(`order ${code} not found.`);
  }

  const { transitionOrderToState } = await run(
    server.admin,
    `mutation($id: ID!, $state: String!) {
      transitionOrderToState(id: $id, state: $state) {
        __typename ... on Order { state } ... on ErrorResult { errorCode message }
      }
    }`,
    { id, state: "Cancelled" },
    z.object({ transitionOrderToState: z.object({ __typename: z.string() }).loose() })
  );

  if (transitionOrderToState.__typename !== "Order") {
    throw new Error(`cancelling ${code} failed: ${JSON.stringify(transitionOrderToState)}`);
  }
}

function orderByCode(orders: DashboardOrder[], code: string): DashboardOrder {
  const order = orders.find((candidate) => candidate.code === code);

  if (order === undefined) {
    throw new Error(`order ${code} not found.`);
  }

  return order;
}

async function productSlugs(server: IntegrationServer): Promise<{
  admin: string[];
  shop: string[];
}> {
  const admin = await run(
    server.admin,
    `query { products(options: { take: 100 }) { items { slug } } }`,
    {},
    ProductListSchema
  );
  const shop = await run(
    server.newShopSession(),
    `query { products(options: { take: 100 }) { items { slug } } }`,
    {},
    ProductListSchema
  );

  return {
    admin: admin.products.items.map((item) => item.slug).toSorted(),
    shop: shop.products.items.map((item) => item.slug).toSorted(),
  };
}

async function variantBySku(
  server: IntegrationServer,
  sku: string
): Promise<{ id: string; sku: string; enabled: boolean; price: number } | null> {
  const { productVariants } = await run(
    server.admin,
    `query($sku: String!) {
      productVariants(options: { filter: { sku: { eq: $sku } } }) { items { id sku enabled price } }
    }`,
    { sku },
    VariantListSchema
  );

  return productVariants.items[0] ?? null;
}

interface PlaceholderRows {
  searchIndex: number;
  prices: number;
  variantTranslations: number;
  channels: number;
  productTranslations: number;
}

async function placeholderRows(pool: Pool): Promise<PlaceholderRows> {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM search_index_item s
         JOIN product_variant v ON v.id = s."productVariantId"
         WHERE v.sku ILIKE 'placeholder-%') AS "searchIndex",
      (SELECT count(*)::int FROM product_variant_price p
         JOIN product_variant v ON v.id = p."variantId"
         WHERE v.sku ILIKE 'placeholder-%') AS prices,
      (SELECT count(*)::int FROM product_variant_translation t
         JOIN product_variant v ON v.id = t."baseId"
         WHERE v.sku ILIKE 'placeholder-%') AS "variantTranslations",
      (SELECT count(*)::int FROM product_variant_channels_channel c
         JOIN product_variant v ON v.id = c."productVariantId"
         WHERE v.sku ILIKE 'placeholder-%') AS channels,
      (SELECT count(*)::int FROM product_translation pt
         JOIN product p ON p.id = pt."baseId"
         WHERE pt.slug ILIKE 'placeholder-%') AS "productTranslations"
  `);

  return z
    .object({
      searchIndex: z.number(),
      prices: z.number(),
      variantTranslations: z.number(),
      channels: z.number(),
      productTranslations: z.number(),
    })
    .parse(rows[0]);
}

let server: IntegrationServer;
let pool: Pool;
let placeholderVariantId: string;

interface Snapshot {
  orders: DashboardOrder[];
  slugs: { admin: string[]; shop: string[] };
  placeholderVariant: { id: string; sku: string; enabled: boolean; price: number } | null;
  takaroVariant: { id: string; sku: string; enabled: boolean; price: number } | null;
  rows: PlaceholderRows;
}

async function snapshot(): Promise<Snapshot> {
  return {
    orders: await dashboardOrders(server.admin),
    slugs: await productSlugs(server),
    placeholderVariant: await variantBySku(server, PLACEHOLDER_SKU),
    takaroVariant: await variantBySku(server, TAKARO_SKU),
    rows: await placeholderRows(pool),
  };
}

let arrangingCode: string;
let cancelledCode: string;
let nativeCode: string;
let before: Snapshot;

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
  pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

  placeholderVariantId = await createPlaceholder(server);

  arrangingCode = await legacyQuoteOrder(server, placeholderVariantId, "int-arranging");
  cancelledCode = await legacyQuoteOrder(server, placeholderVariantId, "int-cancelled");
  await cancelOrder(server, cancelledCode);

  const nativeBuyer = newShopper(server);

  await addLine(nativeBuyer, takaro({ material: "int-pamut" }));
  await completeCheckout(nativeBuyer);

  const placed = await transitionTo(nativeBuyer, "ArrangingPayment");

  if (!("order" in placed)) {
    throw new Error(`the native order was refused: ${placed.refusal}`);
  }

  nativeCode = placed.order.code;

  before = await snapshot();

  expect(orderByCode(before.orders, arrangingCode).state).toBe("ArrangingPayment");
  expect(orderByCode(before.orders, cancelledCode).state).toBe("Cancelled");
  expect(orderByCode(before.orders, nativeCode).state).toBe("ArrangingPayment");
  expect(orderByCode(before.orders, nativeCode).lines[0]?.productVariant.sku).toBe(TAKARO_SKU);

  const legacyLine = orderByCode(before.orders, arrangingCode).lines[0];

  expect(legacyLine?.productVariant.sku).toBe(PLACEHOLDER_SKU);
  expect(legacyLine?.productVariant.product.name).toBe(PLACEHOLDER_NAME);
  expect(legacyLine?.customFields.title).toBe("Hordozó takaró");
  expect(legacyLine?.customFields.quotedUnitPrice).toBe(4500);
});

afterAll(async () => {
  await server.stop();
  await pool.end();
});

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

describe("the placeholder-retirement migration", () => {
  it("retires the placeholders and leaves every order exactly as it was", async () => {
    await runMigration();

    const after = await snapshot();

    expect(after.slugs.admin).not.toContain(PLACEHOLDER_SLUG);
    expect(after.slugs.shop).not.toContain(PLACEHOLDER_SLUG);
    expect(after.placeholderVariant).toBeNull();
    expect(after.rows).toEqual({ ...before.rows, searchIndex: 0 });

    expect(after.orders).toEqual(before.orders);

    expect(after.slugs.admin).toContain("int-takaro");
    expect(after.slugs.shop).toContain("int-takaro");
    expect(after.takaroVariant).toEqual(before.takaroVariant);

    await runMigration();

    expect(await snapshot()).toEqual(after);
  });
});
