/**
 * Seam 2: the shop API's `Order.setDiscounts` / `OrderLine.setState` against
 * what Vendure actually applied. The fields are computed by the same
 * allocation the promotion uses, but resolved in a separate GraphQL pass over
 * the order Vendure hands to the resolvers; this checks they never drift from
 * the booked order-level discount or from the real order lines and quantities.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SET_PROMOTION_NAME, seedCatalog } from "./fixtures";
import { startServer, type IntegrationServer } from "./harness";
import { elavulo, feszek, parna, takaro } from "./lines";
import { addLine, newShopper, type Order } from "./shop";

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

function appliedSetDiscount(order: Order): number {
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

describe("exposed set discounts and line states", () => {
  it("lists instances that add up to the applied discount and reference real lines", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT, { quantity: 2 }));
    await addLine(shopper, takaro(PAMUT));

    const order = await addLine(shopper, feszek(PAMUT, PAMUT));
    const instances = order.setDiscounts;

    expect(instances.map((instance) => [instance.title, instance.amount])).toEqual([
      ["Duó szett", 3000],
      ["Alap szett", 1500],
    ]);
    expect(instances.reduce((sum, instance) => sum + instance.amount, 0)).toBe(
      appliedSetDiscount(order)
    );

    const parnaLine = lineWith(order, "int-parna");
    const takaroLine = lineWith(order, "int-takaro");
    const feszekLine = lineWith(order, "int-feszek");

    expect(instances[0]?.lines).toEqual([
      { orderLineId: parnaLine.id, units: 1 },
      { orderLineId: feszekLine.id, units: 1 },
    ]);
    expect(instances[1]?.lines).toEqual([
      { orderLineId: parnaLine.id, units: 1 },
      { orderLineId: takaroLine.id, units: 1 },
    ]);

    for (const line of order.lines) {
      const units = instances.flatMap((instance) =>
        instance.lines.filter((member) => member.orderLineId === line.id)
      );
      const covered = units.reduce((sum, member) => sum + member.units, 0);

      expect(covered).toBeLessThanOrEqual(line.quantity);
      expect(line.setState).toMatchObject({ kind: "ACTIVE", coveredUnits: covered });
    }

    expect(parnaLine.setState?.groupId).toBe("int-duo-szett");
  });

  it("reports only the covered share of a line as active", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT, { quantity: 3 }));

    const order = await addLine(shopper, takaro(PAMUT));

    expect(lineWith(order, "int-parna").setState).toMatchObject({
      kind: "ACTIVE",
      coveredUnits: 1,
    });
    expect(order.setDiscounts).toHaveLength(1);
  });

  it("reports pending-partner with the biggest set the line belongs to", async () => {
    const shopper = newShopper(server);
    const order = await addLine(shopper, parna(PAMUT));

    expect(order.setDiscounts).toEqual([]);
    expect(order.lines[0]?.setState).toEqual({
      kind: "PENDING_PARTNER",
      groupId: "int-duo-szett",
      title: "Duó szett",
      coveredUnits: 0,
      materialSyncFromLineId: null,
    });
  });

  it("offers a material sync from the partner line when its material is offered", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT));

    const order = await addLine(shopper, takaro(VASZON));

    expect(appliedSetDiscount(order)).toBe(0);
    expect(lineWith(order, "int-takaro").setState).toMatchObject({
      kind: "PENDING_MATERIAL",
      materialSyncFromLineId: lineWith(order, "int-parna").id,
    });
    // The párna's biggest set is the Duó (with the fészek), which has no partner here.
    expect(lineWith(order, "int-parna").setState).toMatchObject({
      kind: "PENDING_PARTNER",
      groupId: "int-duo-szett",
    });
  });

  it("offers no sync when the partner has a different number of material fields", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(LEN));

    const order = await addLine(shopper, feszek(PAMUT, VASZON));

    expect(lineWith(order, "int-parna").setState).toMatchObject({
      kind: "PENDING_MATERIAL",
      materialSyncFromLineId: null,
    });
  });

  it("has no state for a line in no set", async () => {
    const shopper = newShopper(server);
    const order = await addLine(shopper, elavulo(PAMUT));

    expect(order.lines[0]?.setState).toBeNull();
  });
});
