/**
 * Seam 1: our set promotion (condition + action) inside Vendure's order
 * calculator, driven through the shop API's active order.
 *
 * What only this level sees: real order-line ids and quantities as Vendure
 * keeps them (one line per distinct configuration, merged quantities,
 * adjust/remove recalculation), the order-level discount Vendure books from
 * our action, and its interplay with the native free-shipping promotion.
 * The allocation rules are unit-tested in set-allocation.test.ts; the cases
 * here are the ones where line identity and quantity decide the outcome.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SET_PROMOTION_NAME, seedCatalog } from "./fixtures";
import { startServer, type IntegrationServer } from "./harness";
import { feszek, kendo, parna, szalag, takaro } from "./lines";
import { addLine, adjustLine, chooseShipping, newShopper, removeLine, type Order } from "./shop";

const PAMUT = { material: "int-pamut" } as const;
const VASZON = { material: "int-vaszon" } as const;
const LEN = { material: "int-len" } as const;

let server: IntegrationServer;

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

function setDiscount(order: Order): number {
  const discount = order.discounts.find((entry) => entry.description === SET_PROMOTION_NAME);

  return discount === undefined ? 0 : -discount.amountWithTax;
}

function lineWith(order: Order, skuPart: string): Order["lines"][number] {
  const line = order.lines.find((candidate) => candidate.productVariant.sku.includes(skuPart));

  if (line === undefined) {
    throw new Error(`No line with ${skuPart}`);
  }

  return line;
}

describe("the set promotion in Vendure's order calculator", () => {
  it("re-allocates on adjust and remove when one product sits on several lines", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT, { quantity: 2 }));
    await addLine(shopper, parna(VASZON));

    let order = await addLine(shopper, takaro(PAMUT));

    expect(order.lines).toHaveLength(3);
    expect(setDiscount(order)).toBe(1500);

    order = await adjustLine(shopper, lineWith(order, "int-takaro").id, 2);
    expect(setDiscount(order)).toBe(3000);

    order = await adjustLine(shopper, lineWith(order, "int-takaro").id, 3);
    expect(setDiscount(order)).toBe(3000);

    order = await removeLine(shopper, lineWith(order, "int-pamut-nem-kicsi").id);
    expect(setDiscount(order)).toBe(0);
  });

  it("keeps a configured line's computed price when it joins a non-empty basket", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, takaro(PAMUT));

    const order = await addLine(shopper, szalag(150));

    expect(lineWith(order, "int-szalag").unitPriceWithTax).toBe(3000);
    expect(order.subTotalWithTax).toBe(8000 + 3000);
  });

  it("caps pairing at the partner's units (2 x A + 1 x B forms one instance)", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT, { quantity: 2 }));

    let order = await addLine(shopper, takaro(PAMUT));

    expect(setDiscount(order)).toBe(1500);

    // The set discount lands on the member lines only — a non-member line
    // must stay untouched, and the members carry the whole amount.
    order = await addLine(shopper, kendo());

    const memberDiscount = order.lines
      .filter((line) => line.productVariant.sku.startsWith("int-parna") || line.productVariant.sku.startsWith("int-takaro"))
      .reduce((sum, line) => sum - line.discounts.reduce((sub, d) => sub + d.amountWithTax, 0), 0);

    expect(memberDiscount).toBe(1500);
    expect(lineWith(order, "int-kendo").discounts).toEqual([]);
  });

  it("does not pair a product with itself across lines", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT));

    const order = await addLine(shopper, parna(VASZON));

    expect(order.lines).toHaveLength(2);
    expect(setDiscount(order)).toBe(0);
  });

  it("gives each unit to the biggest set first across overlapping sets", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT));
    await addLine(shopper, takaro(PAMUT));

    let order = await addLine(shopper, feszek(PAMUT, PAMUT));

    expect(setDiscount(order)).toBe(3000);

    order = await addLine(shopper, parna(PAMUT, { quantity: 1, meret: "nagy" }));
    expect(setDiscount(order)).toBe(4500);
  });

  it("clamps a set's amount to the covered units' charged subtotal", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, feszek(PAMUT, PAMUT));
    await addLine(shopper, szalag(100));

    const order = await addLine(shopper, kendo());

    expect(setDiscount(order)).toBe(2400);
    expect(order.subTotalWithTax).toBe(12_000);
  });

  it("pairs when the smaller material selection is a subset, not otherwise", async () => {
    const subset = newShopper(server);

    await addLine(subset, parna(PAMUT));
    expect(setDiscount(await addLine(subset, feszek(PAMUT, VASZON)))).toBe(3000);

    const disjoint = newShopper(server);

    await addLine(disjoint, parna(LEN));
    expect(setDiscount(await addLine(disjoint, feszek(PAMUT, VASZON)))).toBe(0);

    const otherColor = newShopper(server);

    await addLine(otherColor, parna({ material: "int-pamut", color: "kek" }));
    expect(setDiscount(await addLine(otherColor, feszek(PAMUT, PAMUT)))).toBe(0);
  });

  it("judges the free-shipping threshold after the set discount", async () => {
    const belowAfterDiscount = newShopper(server);

    await addLine(belowAfterDiscount, feszek(PAMUT, PAMUT, 4));
    await addLine(belowAfterDiscount, parna(PAMUT));
    await addLine(belowAfterDiscount, takaro(PAMUT));

    let order = await chooseShipping(belowAfterDiscount, "gls-elore-utalas");

    expect(order.subTotalWithTax).toBe(61_000 - 3000);
    expect(order.shippingWithTax).toBe(2500);

    const aboveAfterDiscount = newShopper(server);

    await addLine(aboveAfterDiscount, feszek(PAMUT, PAMUT, 5));
    await addLine(aboveAfterDiscount, parna(PAMUT));
    order = await chooseShipping(aboveAfterDiscount, "gls-elore-utalas");

    expect(setDiscount(order)).toBe(3000);
    expect(order.shippingWithTax).toBe(0);
  });
});
