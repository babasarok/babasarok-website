/**
 * Seam: the `barion` payment method inside Vendure's payment flow (ADR 0021
 * slice 1, full prepay) against the in-process fake Barion. The placed order
 * starts a Barion intent on the shop API, the callback controller enqueues the
 * re-query job, and a Succeeded state records the payment through the admin
 * handler path — Payment with role "full" and transactionId = paymentId, order
 * PaymentSettled. A Failed state records nothing. The status poll answers only
 * to the session that created the intent.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeBarionClient } from "../dist/plugins/barion/fake-barion-client";
import { BARION_CLIENT } from "../dist/plugins/barion/barion.service";
import { decodeRefusal } from "../src/shared/refusal";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { szalag } from "./lines";
import {
  addLine,
  chooseShipping,
  newShopper,
  setAddress,
  setCustomer,
  setOrderNotes,
  transitionTo,
  type Order,
} from "./shop";

let server: IntegrationServer;
let barion: FakeBarionClient;

const INTENT_QUERY = `mutation { createBarionPaymentIntent { paymentId gatewayUrl } }`;

const STATUS_QUERY = `query($code: String!) { barionPaymentStatus(orderCode: $code) { paymentId status } }`;

const IntentSchema = z.object({
  createBarionPaymentIntent: z.object({ paymentId: z.string(), gatewayUrl: z.string() }),
});

const StatusSchema = z.object({
  barionPaymentStatus: z.object({ paymentId: z.string().nullable(), status: z.string() }),
});

const PaymentsSchema = z.object({
  orders: z.object({
    items: z.array(
      z.object({
        state: z.string(),
        payments: z.array(
          z.object({
            method: z.string(),
            amount: z.number(),
            state: z.string(),
            transactionId: z.string(),
            metadata: z.record(z.string(), z.unknown()),
          })
        ),
      })
    ),
  }),
});

type OrderPayments = z.output<typeof PaymentsSchema>["orders"]["items"][number];

async function paymentsOf(code: string): Promise<OrderPayments> {
  const data = await run(
    server.admin,
    `query($code: String!) {
      orders(options: { filter: { code: { eq: $code } } }) {
        items { state payments { method amount state transactionId metadata } }
      }
    }`,
    { code },
    PaymentsSchema
  );
  const order = data.orders.items.at(0);

  if (!order) {
    throw new Error(`No order with code ${code}.`);
  }

  return order;
}

/** Polls until the predicate holds, or throws (the callback job runs in-process). */
async function waitFor(
  code: string,
  predicate: (current: OrderPayments) => Promise<boolean>
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await predicate(await paymentsOf(code))) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`The Barion callback job did not settle order ${code} in time.`);
}

async function statusFor(
  shopper: ReturnType<typeof newShopper>,
  code: string
): Promise<{ paymentId: string | null; status: string }> {
  const data = await run(shopper.client, STATUS_QUERY, { code }, StatusSchema);

  return data.barionPaymentStatus;
}

async function postCallback(paymentId: string): Promise<Response> {
  return fetch(
    `http://localhost:4010/payments/barion/callback?paymentId=${encodeURIComponent(paymentId)}`,
    {
      method: "POST",
    }
  );
}

async function placedOrder(): Promise<{ shopper: ReturnType<typeof newShopper>; order: Order }> {
  const shopper = newShopper(server);

  await addLine(shopper, szalag(150));
  await setCustomer(shopper);
  await setAddress(shopper);
  await chooseShipping(shopper, "gls-elore-utalas");
  await setOrderNotes(shopper, { message: "", termsAccepted: true });

  const result = await transitionTo(shopper, "ArrangingPayment");

  if (!("order" in result)) {
    throw new Error(JSON.stringify(result.refusal));
  }

  return { shopper, order: result.order };
}

async function startIntent(
  shopper: ReturnType<typeof newShopper>
): Promise<{ paymentId: string; gatewayUrl: string }> {
  const data = await run(shopper.client, INTENT_QUERY, {}, IntentSchema);

  return data.createBarionPaymentIntent;
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);

  const client: unknown = server.app.get(BARION_CLIENT);

  if (!(client instanceof FakeBarionClient)) {
    throw new TypeError("the integration suite must run against the in-process fake Barion");
  }

  barion = client;
});

afterAll(async () => {
  await server.stop();
});

describe("Barion full-prepay", () => {
  it("refuses the intent without a placed order, with a coded refusal", async () => {
    const shopper = newShopper(server);
    await addLine(shopper, szalag(150));

    const error = await run(shopper.client, INTENT_QUERY, {}, z.unknown()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(decodeRefusal((error as Error).message)?.code).toBe("BARION_ORDER_STATE");
  });

  it("starts the gateway payment for the full total and returns the gateway URL", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper);

    expect(intent.paymentId).toBeTruthy();
    expect(intent.gatewayUrl).toMatch(/^https:\/\/secure/);

    const started = barion.requestsFor(order.code).at(-1);

    expect(started).toMatchObject({
      paymentRequestId: `${order.code}-1`,
      currencyCode: "HUF",
      locale: "hu-HU",
      total: order.totalWithTax,
    });
    expect(started?.callbackUrl).toContain("/payments/barion/callback");
    expect(started?.redirectUrl).toContain(`/payment/confirmation?orderCode=${order.code}`);

    const status = await statusFor(shopper, order.code);

    expect(status).toEqual({ paymentId: intent.paymentId, status: "Processing" });
  });

  it("records the payment on a Succeeded callback and settles the order", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper);

    barion.setStatus(intent.paymentId, "Succeeded", [
      { transactionId: "tx-1", total: order.totalWithTax, type: "CardPayment" },
    ]);

    const ack = await postCallback(intent.paymentId);

    expect(ack.status).toBe(200);

    await waitFor(order.code, (current) => Promise.resolve(current.state === "PaymentSettled"));

    const settled = await paymentsOf(order.code);

    expect(settled.state).toBe("PaymentSettled");
    expect(settled.payments).toEqual([
      {
        method: "barion",
        amount: order.totalWithTax,
        state: "Settled",
        transactionId: intent.paymentId,
        metadata: {
          role: "full",
          barionPaymentId: intent.paymentId,
          amount: order.totalWithTax,
          currencyCode: "HUF",
          barionStatus: "Succeeded",
        },
      },
    ]);

    expect(await statusFor(shopper, order.code)).toEqual({
      paymentId: intent.paymentId,
      status: "Succeeded",
    });
  });

  it("never records twice: a repeated Succeeded callback is a no-op", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper);

    barion.setStatus(intent.paymentId, "Succeeded");
    await postCallback(intent.paymentId);
    await waitFor(order.code, (current) => Promise.resolve(current.state === "PaymentSettled"));

    await postCallback(intent.paymentId);
    await postCallback(intent.paymentId);

    expect((await paymentsOf(order.code)).payments).toHaveLength(1);
  });

  it("records nothing on a Failed callback and the status poll reports Failed", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper);

    barion.setStatus(intent.paymentId, "Failed");

    const ack = await postCallback(intent.paymentId);

    expect(ack.status).toBe(200);

    await waitFor(
      order.code,
      async () => (await statusFor(shopper, order.code)).status === "Failed"
    );

    const declined = await paymentsOf(order.code);

    expect(declined.state).toBe("ArrangingPayment");
    expect(declined.payments).toEqual([]);
  });

  it("answers the status poll with no paymentId for another session's order code", async () => {
    const { shopper, order } = await placedOrder();

    await startIntent(shopper);

    const foreign = newShopper(server);

    expect(await statusFor(foreign, order.code)).toEqual({ paymentId: null, status: "Processing" });
  });

  it("answers an unknown callback id with 200 and no job", async () => {
    const ack = await postCallback("00000000-0000-0000-0000-000000000000");

    expect(ack.status).toBe(200);
  });
});
