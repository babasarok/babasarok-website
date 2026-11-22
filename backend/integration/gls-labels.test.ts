/**
 * Seam: the `gls` fulfillment handler inside Vendure's fulfillment flow
 * (ADR 0020), against the in-process fake GLS. The owner records the bank
 * transfer, fulfills with the handler the shipping method preselects, and
 * gets the parcel number as the native tracking code plus a private label
 * PDF; cancelling deletes the parcel and drops the PDF, after which a new
 * label can be made. Refusals (no sender address, not a GLS delivery, a
 * partial fulfillment) surface as the handler error the dashboard shows.
 * Utánvét orders collect the outstanding total.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import {
  fulfill,
  GLS_SENDER as SENDER,
  handlerError,
  placeOrder,
  recordBankTransfer,
  setSender,
} from "./gls-flow";

let server: IntegrationServer;

async function labelText(fulfillmentId: string): Promise<string | null> {
  const data = await run(
    server.admin,
    `query($id: ID!) { glsLabel(fulfillmentId: $id) { fileName base64 } }`,
    { id: fulfillmentId },
    z.object({ glsLabel: z.object({ fileName: z.string(), base64: z.string() }).nullable() })
  );

  if (!data.glsLabel) {
    return null;
  }

  return Buffer.from(data.glsLabel.base64, "base64").toString("latin1");
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

describe("GLS labels", () => {
  it("preselects the gls handler on the GLS delivery methods", async () => {
    const data = await run(
      server.admin,
      `query { shippingMethods { items { code fulfillmentHandlerCode } } }`,
      {},
      z.object({
        shippingMethods: z.object({
          items: z.array(z.object({ code: z.string(), fulfillmentHandlerCode: z.string() })),
        }),
      })
    );

    expect(
      Object.fromEntries(data.shippingMethods.items.map((m) => [m.code, m.fulfillmentHandlerCode]))
    ).toEqual({
      "gls-elore-utalas": "gls",
      "gls-utanvet": "gls",
      szemelyes: "manual-fulfillment",
    });
  });

  it("refuses while the channel's GLS sender address is incomplete, naming what is missing", async () => {
    await setSender(server, { ...SENDER, street: "", phone: " " });

    const order = await placeOrder(server, "gls-elore-utalas");

    await recordBankTransfer(server, order);

    expect(handlerError(await fulfill(server, order))).toContain(
      "Hiányos a GLS feladó címe (utca, telefonszám)"
    );
  });

  it("labels a paid prepaid order: tracking code, private PDF, no cash on delivery", async () => {
    await setSender(server, SENDER);

    const order = await placeOrder(server, "gls-elore-utalas");

    expect(await recordBankTransfer(server, order)).toBe("PaymentSettled");

    const fulfillment = await fulfill(server, order);

    expect(fulfillment).toMatchObject({
      __typename: "Fulfillment",
      method: "GLS",
      state: "Pending",
    });

    if (fulfillment.__typename !== "Fulfillment" || !("trackingCode" in fulfillment)) {
      return;
    }

    expect(fulfillment.trackingCode).toMatch(/^9\d{10}$/);

    const pdf = await labelText(fulfillment.id);

    expect(pdf).toContain(`FAKE GLS LABEL ${fulfillment.trackingCode}`);
    expect(pdf).not.toContain("COD");
  });

  it("deletes the parcel on cancel, drops the PDF, and allows a new label", async () => {
    await setSender(server, SENDER);

    const order = await placeOrder(server, "gls-elore-utalas");

    await recordBankTransfer(server, order);

    const first = await fulfill(server, order);

    if (first.__typename !== "Fulfillment" || !("id" in first)) {
      throw new Error(`fulfillment refused: ${JSON.stringify(first)}`);
    }

    const cancelled = await run(
      server.admin,
      `mutation($id: ID!) {
        transitionFulfillmentToState(id: $id, state: "Cancelled") {
          __typename ... on Fulfillment { state } ... on ErrorResult { errorCode message }
        }
      }`,
      { id: first.id },
      z.object({ transitionFulfillmentToState: z.object({ __typename: z.string() }).loose() })
    );

    expect(cancelled.transitionFulfillmentToState).toMatchObject({ state: "Cancelled" });
    expect(await labelText(first.id)).toBeNull();

    const second = await fulfill(server, order);

    expect(second).toMatchObject({ __typename: "Fulfillment", method: "GLS" });
    expect("trackingCode" in second && second.trackingCode).not.toBe(first.trackingCode);
  });

  it("drops the PDF when the owner marks the fulfillment delivered", async () => {
    await setSender(server, SENDER);

    const order = await placeOrder(server, "gls-elore-utalas");
    await recordBankTransfer(server, order);
    const fulfillment = await fulfill(server, order);

    if (fulfillment.__typename !== "Fulfillment" || !("id" in fulfillment)) {
      throw new Error(`fulfillment refused: ${JSON.stringify(fulfillment)}`);
    }

    expect(await labelText(fulfillment.id)).not.toBeNull();

    const delivered = await run(
      server.admin,
      `mutation($id: ID!) {
        transitionFulfillmentToState(id: $id, state: "Delivered") {
          __typename ... on Fulfillment { state } ... on ErrorResult { errorCode message }
        }
      }`,
      { id: fulfillment.id },
      z.object({ transitionFulfillmentToState: z.object({ __typename: z.string() }).loose() })
    );

    expect(delivered.transitionFulfillmentToState).toMatchObject({ state: "Delivered" });
    expect(await labelText(fulfillment.id)).toBeNull();
  });

  it("collects the outstanding total on an utánvét order", async () => {
    await setSender(server, SENDER);

    const order = await placeOrder(server, "gls-utanvet");
    const fulfillment = await fulfill(server, order);

    if (fulfillment.__typename !== "Fulfillment" || !("id" in fulfillment)) {
      throw new Error(`fulfillment refused: ${JSON.stringify(fulfillment)}`);
    }

    expect(await labelText(fulfillment.id)).toContain(`COD ${order.totalWithTax} HUF`);
  });

  it("refuses a partial fulfillment and an order not delivered by GLS", async () => {
    await setSender(server, SENDER);

    const prepaid = await placeOrder(server, "gls-elore-utalas");

    await recordBankTransfer(server, prepaid);

    const firstLine = prepaid.lines.at(0);

    if (!firstLine) {
      throw new Error("the order has no lines");
    }

    expect(
      handlerError(
        await fulfill(server, prepaid, [
          { orderLineId: firstLine.id, quantity: firstLine.quantity },
        ])
      )
    ).toContain("összes tételét");

    const pickup = await placeOrder(server, "szemelyes");

    await recordBankTransfer(server, pickup);

    expect(handlerError(await fulfill(server, pickup))).toContain("nem GLS-szállítású");
  });
});
