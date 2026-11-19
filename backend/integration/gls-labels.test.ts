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
import { kendo, szalag } from "./lines";
import {
  addLine,
  chooseShipping,
  newShopper,
  setAddress,
  setCustomer,
  setOrderNotes,
  transitionTo,
} from "./shop";

let server: IntegrationServer;

const SENDER = {
  name: "Babasarok",
  street: "Fő utca",
  houseNumber: "1",
  city: "Telkibánya",
  zipCode: "3896",
  countryCode: "HU",
  phone: "+36301234567",
  email: "bolt@example.com",
};

const PlacedSchema = z.object({
  id: z.string(),
  code: z.string(),
  totalWithTax: z.number(),
  lines: z.array(z.object({ id: z.string(), quantity: z.number() })),
});

type Placed = z.output<typeof PlacedSchema>;

const FulfillResultSchema = z.object({
  addFulfillmentToOrder: z.union([
    z.object({
      __typename: z.literal("Fulfillment"),
      id: z.string(),
      method: z.string(),
      trackingCode: z.string(),
      state: z.string(),
    }),
    z.object({
      __typename: z.string(),
      errorCode: z.string(),
      fulfillmentHandlerError: z.string().optional(),
    }),
  ]),
});

async function placeOrder(shippingCode: string): Promise<Placed> {
  const shopper = newShopper(server);

  await addLine(shopper, kendo(2));
  await addLine(shopper, szalag(120));
  await setCustomer(shopper);
  await setAddress(shopper, { fullName: "Kovács Béla", phoneNumber: "+36309999999" });
  await chooseShipping(shopper, shippingCode);
  await setOrderNotes(shopper, { message: "", termsAccepted: true });

  const result = await transitionTo(shopper, "ArrangingPayment");

  if ("refusal" in result) {
    throw new Error(JSON.stringify(result.refusal));
  }

  const data = await run(
    server.admin,
    `query($code: String!) {
      orders(options: { filter: { code: { eq: $code } } }) { items { id code totalWithTax lines { id quantity } } }
    }`,
    { code: result.order.code },
    z.object({ orders: z.object({ items: z.tuple([PlacedSchema]) }) })
  );

  return data.orders.items[0];
}

async function recordBankTransfer(order: Placed): Promise<string> {
  const data = await run(
    server.admin,
    `mutation($orderId: ID!) {
      addManualPaymentToOrder(input: { orderId: $orderId, method: "banki-atutalas", metadata: {} }) {
        __typename ... on Order { state }
      }
    }`,
    { orderId: order.id },
    z.object({ addManualPaymentToOrder: z.object({ state: z.string() }) })
  );

  return data.addManualPaymentToOrder.state;
}

async function fulfill(
  order: Placed,
  lines = order.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity }))
): Promise<z.output<typeof FulfillResultSchema>["addFulfillmentToOrder"]> {
  const data = await run(
    server.admin,
    `mutation($input: FulfillOrderInput!) {
      addFulfillmentToOrder(input: $input) {
        __typename
        ... on Fulfillment { id method trackingCode state }
        ... on CreateFulfillmentError { errorCode fulfillmentHandlerError }
        ... on ErrorResult { errorCode }
      }
    }`,
    { input: { lines, handler: { code: "gls", arguments: [] } } },
    FulfillResultSchema
  );

  return data.addFulfillmentToOrder;
}

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

async function setSender(sender: typeof SENDER): Promise<void> {
  const { activeChannel } = await run(
    server.admin,
    `query { activeChannel { id } }`,
    {},
    z.object({ activeChannel: z.object({ id: z.string() }) })
  );

  await run(
    server.admin,
    `mutation($input: UpdateChannelInput!) { updateChannel(input: $input) { __typename } }`,
    { input: { id: activeChannel.id, customFields: { glsSender: sender } } },
    z.unknown()
  );
}

function handlerError(result: Awaited<ReturnType<typeof fulfill>>): string | undefined {
  if (result.__typename === "Fulfillment" || !("fulfillmentHandlerError" in result)) {
    return undefined;
  }

  return result.fulfillmentHandlerError;
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
    await setSender({ ...SENDER, street: "", phone: " " });

    const order = await placeOrder("gls-elore-utalas");

    await recordBankTransfer(order);

    expect(handlerError(await fulfill(order))).toContain(
      "Hiányos a GLS feladó címe (utca, telefonszám)"
    );
  });

  it("labels a paid prepaid order: tracking code, private PDF, no cash on delivery", async () => {
    await setSender(SENDER);

    const order = await placeOrder("gls-elore-utalas");

    expect(await recordBankTransfer(order)).toBe("PaymentSettled");

    const fulfillment = await fulfill(order);

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
    await setSender(SENDER);

    const order = await placeOrder("gls-elore-utalas");

    await recordBankTransfer(order);

    const first = await fulfill(order);

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

    const second = await fulfill(order);

    expect(second).toMatchObject({ __typename: "Fulfillment", method: "GLS" });
    expect("trackingCode" in second && second.trackingCode).not.toBe(first.trackingCode);
  });

  it("collects the outstanding total on an utánvét order", async () => {
    await setSender(SENDER);

    const order = await placeOrder("gls-utanvet");
    const fulfillment = await fulfill(order);

    if (fulfillment.__typename !== "Fulfillment" || !("id" in fulfillment)) {
      throw new Error(`fulfillment refused: ${JSON.stringify(fulfillment)}`);
    }

    expect(await labelText(fulfillment.id)).toContain(`COD ${order.totalWithTax} HUF`);
  });

  it("refuses a partial fulfillment and an order not delivered by GLS", async () => {
    await setSender(SENDER);

    const prepaid = await placeOrder("gls-elore-utalas");

    await recordBankTransfer(prepaid);

    const firstLine = prepaid.lines.at(0);

    if (!firstLine) {
      throw new Error("the order has no lines");
    }

    expect(
      handlerError(
        await fulfill(prepaid, [{ orderLineId: firstLine.id, quantity: firstLine.quantity }])
      )
    ).toContain("összes tételét");

    const pickup = await placeOrder("szemelyes");

    await recordBankTransfer(pickup);

    expect(handlerError(await fulfill(pickup))).toContain("nem GLS-szállítású");
  });
});
