/**
 * Seam: a stock-tracked ready-made product (no canonical definition) vs. the
 * checkout flow. A basket only checks the stock, a placed order holds it (the
 * PlacedOrderStockAllocationStrategy allocates on AddingItems →
 * ArrangingPayment): two baskets can both hold the single unit, but only the
 * first checkout takes it — the loser's line flags OUT_OF_STOCK and its
 * checkout is refused; cancelling the placed order frees the unit. The
 * shop-API stockLevel reflects the saleable stock, which is what hides the
 * sold-out product on the site. Each case leaves its placed order cancelled,
 * so the unit is free again for the next one.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { run, startServer, type IntegrationServer } from "./harness";
import { z } from "zod";
import {
  activeOrder,
  addLine,
  completeCheckout,
  newShopper,
  transitionTo,
  type Shopper,
} from "./shop";

const SKU = "int-kesztermek";
const SLUG = "int-kesztermek";

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

/** Cancels every order of the shared single unit that is still holding it. */
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
      order.lines.some((line) => line.productVariant.sku === SKU)
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

async function seedReadyMadeProduct(): Promise<void> {
  const product = await run(
    server.admin,
    `mutation {
      createProduct(input: { translations: [{ languageCode: hu, name: "Késztermék", slug: "${SLUG}", description: "" }] }) { id }
    }`,
    {},
    z.object({ createProduct: z.object({ id: z.string() }) })
  );

  await run(
    server.admin,
    `mutation($productId: ID!) {
      createProductVariants(input: [{ productId: $productId, sku: "${SKU}", price: 4000, stockOnHand: 1, translations: [{ languageCode: hu, name: "Késztermék" }] }]) {
        id sku
      }
    }`,
    { productId: product.createProduct.id },
    z.unknown()
  );
}

async function shopStockLevel(): Promise<string> {
  const data = await run(
    server.newShopSession(),
    `query($slug: String!) { product(slug: $slug) { variants { stockLevel } } }`,
    { slug: SLUG },
    z.object({
      product: z.object({ variants: z.array(z.object({ stockLevel: z.string() })) }).nullable(),
    })
  );

  return data.product?.variants.at(0)?.stockLevel ?? "MISSING";
}

async function placeOrder(shopper: Shopper): Promise<void> {
  await completeCheckout(shopper);
  expect(await transitionTo(shopper, "ArrangingPayment")).toMatchObject({
    order: { state: "ArrangingPayment" },
  });
}

beforeAll(async () => {
  server = await startServer();
  await seedReadyMadeProduct();
});

afterEach(cancelHeldOrders);

afterAll(async () => {
  await server.stop();
});

describe("ready-made stock", () => {
  it("lets both baskets hold the single unit, but only the first checkout takes it", async () => {
    const first = newShopper(server);
    const second = newShopper(server);

    await addLine(first, { sku: SKU });
    await addLine(second, { sku: SKU });

    expect((await activeOrder(first)).lines[0]?.invalidReason).toBeNull();
    expect((await activeOrder(second)).lines[0]?.invalidReason).toBeNull();

    await placeOrder(first);

    const flagged = await activeOrder(second);

    expect(flagged.lines[0]?.invalidReason).toMatchObject({ code: "OUT_OF_STOCK" });

    await completeCheckout(second);
    // The default order process's own stock check (which takes the allocation
    // lock because our strategy allocates in this same transition) refuses
    // first, so its translated message wins over our coded refusal.
    expect(await transitionTo(second, "ArrangingPayment")).toHaveProperty("refusal");

    await expect(addLine(second, { sku: SKU })).rejects.toMatchObject({
      errorCode: "INSUFFICIENT_STOCK_ERROR",
    });
  });

  it("frees the unit when the placed order is cancelled", async () => {
    const first = newShopper(server);
    const second = newShopper(server);

    await addLine(first, { sku: SKU });
    await addLine(second, { sku: SKU });
    await placeOrder(first);
    await cancelHeldOrders();

    const cleared = await activeOrder(second);

    expect(cleared.lines[0]?.invalidReason).toBeNull();

    await placeOrder(second);
  });

  it("reports the sold-out variant so the site can hide it", async () => {
    // Stock 1: saleable 1 is the default display strategy's LOW_STOCK band
    // (≤ 2), still a listed product; only saleable 0 is OUT_OF_STOCK.
    expect(await shopStockLevel()).toBe("LOW_STOCK");

    const shopper = newShopper(server);

    await addLine(shopper, { sku: SKU });
    await placeOrder(shopper);

    expect(await shopStockLevel()).toBe("OUT_OF_STOCK");
  });
});
