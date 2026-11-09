/**
 * Seam 3: a cached catalog vs. the live one. Buyers hold lines the owner then
 * changes through the admin API (disables a variant, removes a material
 * colour or a product option, edits a price). The server verdict must reach the basket:
 * `OrderLine.invalidReason`, the Hungarian refusal at the transition to
 * ArrangingPayment, and recovery by removing/re-adding the line (ADR 0013
 * decision 6). Each case uses its own variant, so the owner's edits never
 * leak between cases. A removed product option is reported as
 * VARIANT_UNAVAILABLE, not OPTION_NOT_OFFERED: the owner's save syncs the
 * variants and retires the one the line uses, and Vendure's own (English)
 * refusal then wins over our Hungarian one at the transition.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCatalog } from "./fixtures";
import { startServer, type IntegrationServer } from "./harness";
import { elavulo } from "./lines";
import {
  activeOrder,
  addLine,
  adjustLine,
  chooseShipping,
  completeCheckout,
  newShopper,
  removeChoiceOption,
  removeLine,
  removeMaterialColor,
  setVariantEnabled,
  setBasePrice,
  transitionTo,
} from "./shop";

const PAMUT = { material: "int-pamut" } as const;
const VASZON = { material: "int-vaszon" } as const;

let server: IntegrationServer;

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

describe("stale basket lines", () => {
  it("flags a disabled variant, refuses checkout, and recovers once the line is replaced", async () => {
    const shopper = newShopper(server);
    const stale = elavulo(PAMUT, "kicsi");
    const order = await addLine(shopper, stale);

    expect(order.lines[0]?.invalidReason).toBeNull();

    await completeCheckout(shopper);
    await setVariantEnabled(server, stale.sku, false);

    const flagged = await activeOrder(shopper);

    expect(flagged.lines[0]?.invalidReason?.code).toBe("VARIANT_UNAVAILABLE");

    const refused = await transitionTo(shopper, "ArrangingPayment");

    expect(refused).toEqual({ refusal: flagged.lines[0]?.invalidReason?.message });
    expect(flagged.lines[0]?.invalidReason?.message).toContain("már nem elérhető");

    await removeLine(shopper, flagged.lines[0]?.id ?? "");

    const replaced = await addLine(shopper, elavulo(PAMUT, "nagy"));

    expect(replaced.lines.map((line) => line.invalidReason)).toEqual([null]);
    await chooseShipping(shopper, "szemelyes");
    expect(await transitionTo(shopper, "ArrangingPayment")).toMatchObject({
      order: { state: "ArrangingPayment" },
    });
  });

  it("flags a line whose chosen material colour was removed", async () => {
    const shopper = newShopper(server);
    const order = await addLine(shopper, elavulo({ material: "int-len", color: "kek" }));

    expect(order.lines[0]?.invalidReason).toBeNull();

    await completeCheckout(shopper);
    await removeMaterialColor(server, "int-len", "kek");

    const flagged = await activeOrder(shopper);

    expect(flagged.lines[0]?.invalidReason?.code).toBe("OPTION_NOT_OFFERED");
    expect(await transitionTo(shopper, "ArrangingPayment")).toEqual({
      refusal: flagged.lines[0]?.invalidReason?.message,
    });

    await removeLine(shopper, flagged.lines[0]?.id ?? "");

    const replaced = await addLine(shopper, elavulo({ material: "int-len", color: "feher" }));

    expect(replaced.lines[0]?.invalidReason).toBeNull();
  });

  it("reports a line whose chosen product option was removed from the definition", async () => {
    const shopper = newShopper(server);
    const order = await addLine(shopper, elavulo(PAMUT, "nagy"));

    expect(order.lines[0]?.invalidReason).toBeNull();

    await completeCheckout(shopper);
    await removeChoiceOption(server, "int-elavulo", "meret", "nagy");

    const flagged = await activeOrder(shopper);

    expect(flagged.lines[0]?.invalidReason).toEqual({
      code: "VARIANT_UNAVAILABLE",
      message: "A(z) Elavuló kiválasztott változata már nem elérhető.",
    });
    expect(await transitionTo(shopper, "ArrangingPayment")).toEqual({
      refusal:
        'Cannot transition to "ArrangingPayment" because the Order contains ProductVariants which are no longer available',
    });

    await removeLine(shopper, flagged.lines[0]?.id ?? "");

    const replaced = await addLine(shopper, elavulo({ material: "int-len" }, "kicsi"));

    expect(replaced.lines[0]?.invalidReason).toBeNull();
  });

  it("keeps a line's stored price until it is adjusted, then shows the new price", async () => {
    const shopper = newShopper(server);
    const priced = elavulo(VASZON, "kicsi");
    const order = await addLine(shopper, priced);

    expect(order.lines[0]?.unitPriceWithTax).toBe(6500);

    await setBasePrice(server, "int-elavulo", 6500);

    const untouched = await activeOrder(shopper);

    expect(untouched.lines[0]?.unitPriceWithTax).toBe(6500);
    expect(untouched.lines[0]?.invalidReason).toBeNull();

    const adjusted = await adjustLine(shopper, untouched.lines[0]?.id ?? "", 2);

    expect(adjusted.lines[0]?.unitPriceWithTax).toBe(7000);
  });
});
