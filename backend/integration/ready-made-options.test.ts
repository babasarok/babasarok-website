/**
 * Seam: a ready-made product with native option groups (ADR 0019) inside the
 * order flow. Definition-less lines price with their own variant's list price
 * (ServerPricingStrategy passes it through), stock is per variant, and the
 * placed order's emails name the ordered variant's options — built from the
 * variant itself, not from a definition.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { run, startServer, emailsFor, emailText, type IntegrationServer } from "./harness";
import { z } from "zod";
import {
  activeOrder,
  addLine,
  completeCheckout,
  newShopper,
  transitionTo,
  type Order,
  type Shopper,
} from "./shop";

const S_SKU = "int-kesz-opcio-s";
const L_SKU = "int-kesz-opcio-l";
const PLAIN_SKU = "int-kesz-opcio-egy";
const SKUS = new Set([S_SKU, L_SKU, PLAIN_SKU]);
const OWNER_EMAIL = "rendeles@babasarok.test";

let server: IntegrationServer;

const PlacedOrdersSchema = z.object({
  orders: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        state: z.string(),
        lines: z.array(z.object({ productVariant: z.object({ sku: z.string() }) })),
      })
    ),
  }),
});

/** Cancels every placed order holding one of the suite's units. */
async function cancelHeldOrders(): Promise<void> {
  const { orders } = await run(
    server.admin,
    `query {
      orders(options: { take: 100 }) {
        items { id state lines { productVariant { sku } } }
      }
    }`,
    {},
    PlacedOrdersSchema
  );

  for (const order of orders.items) {
    if (
      order.state === "ArrangingPayment" &&
      order.lines.some((line) => SKUS.has(line.productVariant.sku))
    ) {
      await run(
        server.admin,
        `mutation($orderId: ID!) { cancelOrder(input: { orderId: $orderId }) { __typename } }`,
        { orderId: order.id },
        z.unknown()
      );
    }
  }
}

async function seedOptionProduct(): Promise<void> {
  const product = await run(
    server.admin,
    `mutation {
      createProduct(input: { translations: [{ languageCode: hu, name: "Késztermék mérettel", slug: "int-kesz-opcio", description: "" }] }) { id }
    }`,
    {},
    z.object({ createProduct: z.object({ id: z.string() }) })
  );

  const group = await run(
    server.admin,
    `mutation {
      createProductOptionGroup(input: {
        code: "int-meret"
        translations: [{ languageCode: hu, name: "Méret" }]
        options: [
          { code: "int-s", translations: [{ languageCode: hu, name: "S" }] }
          { code: "int-l", translations: [{ languageCode: hu, name: "L" }] }
        ]
      }) { id options { id } }
    }`,
    {},
    z.object({
      createProductOptionGroup: z.object({
        id: z.string(),
        options: z.array(z.object({ id: z.string() })),
      }),
    })
  );

  await run(
    server.admin,
    `mutation($productId: ID!, $groupId: ID!) {
      addOptionGroupToProduct(productId: $productId, optionGroupId: $groupId) { id }
    }`,
    { productId: product.createProduct.id, groupId: group.createProductOptionGroup.id },
    z.unknown()
  );

  const small = group.createProductOptionGroup.options.at(0);
  const large = group.createProductOptionGroup.options.at(1);

  if (small === undefined || large === undefined) {
    throw new Error("The option group did not seed both options.");
  }

  await run(
    server.admin,
    `mutation($productId: ID!, $smallOptionId: ID!, $largeOptionId: ID!) {
      createProductVariants(input: [
        { productId: $productId, sku: "${S_SKU}", price: 4000, stockOnHand: 1, optionIds: [$smallOptionId], translations: [{ languageCode: hu, name: "Késztermék mérettel S" }] }
        { productId: $productId, sku: "${L_SKU}", price: 6000, stockOnHand: 3, optionIds: [$largeOptionId], translations: [{ languageCode: hu, name: "Késztermék mérettel L" }] }
      ]) { id sku }
    }`,
    { productId: product.createProduct.id, smallOptionId: small.id, largeOptionId: large.id },
    z.unknown()
  );
}

async function seedPlainProduct(): Promise<void> {
  const product = await run(
    server.admin,
    `mutation {
      createProduct(input: { translations: [{ languageCode: hu, name: "Késztermék egyszerű", slug: "int-kesz-egyszeru", description: "" }] }) { id }
    }`,
    {},
    z.object({ createProduct: z.object({ id: z.string() }) })
  );

  await run(
    server.admin,
    `mutation($productId: ID!) {
      createProductVariants(input: [{ productId: $productId, sku: "${PLAIN_SKU}", price: 2000, stockOnHand: 2, translations: [{ languageCode: hu, name: "Késztermék egyszerű" }] }]) {
        id sku
      }
    }`,
    { productId: product.createProduct.id },
    z.unknown()
  );
}

async function placeOrder(shopper: Shopper): Promise<Order> {
  await completeCheckout(shopper);
  const result = await transitionTo(shopper, "ArrangingPayment");

  expect(result).toMatchObject({ order: { state: "ArrangingPayment" } });

  if ("order" in result) {
    return result.order;
  }

  throw new Error("The transition did not place the order.");
}

beforeAll(async () => {
  server = await startServer();
  await seedOptionProduct();
  await seedPlainProduct();
});

afterEach(cancelHeldOrders);

afterAll(async () => {
  await server.stop();
});

describe("ready-made options", () => {
  it("prices each option variant with its own list price", async () => {
    const large = newShopper(server);
    const small = newShopper(server);

    const largeOrder = await addLine(large, { sku: L_SKU });
    const smallOrder = await addLine(small, { sku: S_SKU });

    expect(largeOrder.lines[0]?.productVariant.sku).toBe(L_SKU);
    expect(largeOrder.lines[0]?.unitPriceWithTax).toBe(6000);
    expect(smallOrder.lines[0]?.productVariant.sku).toBe(S_SKU);
    expect(smallOrder.lines[0]?.unitPriceWithTax).toBe(4000);
  });

  it("holds stock per variant: the sold-out S flags, the L line stays valid", async () => {
    const first = newShopper(server);
    const second = newShopper(server);

    await addLine(first, { sku: L_SKU });
    await addLine(first, { sku: S_SKU });
    await addLine(second, { sku: L_SKU });
    await addLine(second, { sku: S_SKU });

    await placeOrder(first);

    const flagged = await activeOrder(second);
    const bySku = new Map(flagged.lines.map((line) => [line.productVariant.sku, line]));

    expect(bySku.get(S_SKU)?.invalidReason).toMatchObject({ code: "OUT_OF_STOCK" });
    expect(bySku.get(L_SKU)?.invalidReason).toBeNull();
  });

  it("emails the ordered variant's options, and no rows for the optionless variant", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, { sku: L_SKU });
    await addLine(shopper, { sku: PLAIN_SKU });
    const order = await placeOrder(shopper);

    const emails = await emailsFor(order.code, 2);
    const owner = emails.find((email) => email.recipient === OWNER_EMAIL);

    expect(owner?.subject).toBe(`Új árajánlatkérés: ${order.code}`);
    expect(emailText(owner?.body ?? "")).toContain("[RAKTÁRI]");

    for (const email of emails) {
      const body = emailText(email.body);

      expect(body).toContain("Méret: L");
      expect(body.split("Méret:").length - 1).toBe(1);
    }
  });
});
