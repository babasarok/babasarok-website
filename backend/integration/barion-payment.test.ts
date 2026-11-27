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
  activeOrder,
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

const INTENT_QUERY = `mutation($orderCode: String!) { createBarionPaymentIntent(orderCode: $orderCode) { paymentId gatewayUrl } }`;

const STATUS_QUERY = `query($code: String!) { barionPaymentStatus(orderCode: $code) { paymentId status } }`;

const PENDING_QUERY = `query { barionPendingOrder { code state totalQuantity } }`;

const PendingSchema = z.object({
  barionPendingOrder: z
    .object({
      code: z.string(),
      state: z.string(),
      totalQuantity: z.number(),
    })
    .nullable(),
});

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
  shopper: ReturnType<typeof newShopper>,
  orderCode: string
): Promise<{ paymentId: string; gatewayUrl: string }> {
  const data = await run(shopper.client, INTENT_QUERY, { orderCode }, IntentSchema);

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
  it("refuses the intent for an active order and a foreign code, with a coded refusal", async () => {
    const shopper = newShopper(server);
    await addLine(shopper, szalag(150));

    const active = await activeOrder(shopper);
    const onActive = await run(
      shopper.client,
      INTENT_QUERY,
      { orderCode: active.code },
      z.unknown()
    ).catch((e: unknown) => e);

    expect(onActive).toBeInstanceOf(Error);
    expect(decodeRefusal((onActive as Error).message)?.code).toBe("BARION_ORDER_STATE");

    const foreign = await run(
      shopper.client,
      INTENT_QUERY,
      { orderCode: "NOSUCHORDER" },
      z.unknown()
    ).catch((e: unknown) => e);

    expect(foreign).toBeInstanceOf(Error);
    expect(decodeRefusal((foreign as Error).message)?.code).toBe("BARION_ORDER_STATE");
  });

  it("starts the gateway payment for the full total and returns the gateway URL", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper, order.code);

    expect(intent.paymentId).toBeTruthy();
    expect(intent.gatewayUrl).toMatch(/^https:\/\/secure/);

    const started = barion.requestsFor(order.code).at(-1);

    expect(started).toMatchObject({
      paymentRequestId: `${order.code}-1`,
      currencyCode: "HUF",
      locale: "hu-HU",
      total: order.totalWithTax,
    });
    // The gateway requires a non-empty Name, Unit and ItemTotal on every item
    // (the sandbox rejected the first integration with exactly these).
    expect(started?.items.length).toBeGreaterThan(0);
    for (const item of started?.items ?? []) {
      expect(item.name.trim().length).toBeGreaterThan(0);
      expect(item.unit.trim().length).toBeGreaterThan(0);
      expect(item.total).toBeGreaterThan(0);
    }
    expect(started?.callbackUrl).toContain("/payments/barion/callback");
    expect(started?.redirectUrl).toContain(`/payment/confirmation?orderCode=${order.code}`);

    const status = await statusFor(shopper, order.code);

    expect(status).toEqual({ paymentId: intent.paymentId, status: "Processing" });
  });

  it("records the payment on a Succeeded callback and settles the order", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper, order.code);

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
    const intent = await startIntent(shopper, order.code);

    barion.setStatus(intent.paymentId, "Succeeded");
    await postCallback(intent.paymentId);
    await waitFor(order.code, (current) => Promise.resolve(current.state === "PaymentSettled"));

    await postCallback(intent.paymentId);
    await postCallback(intent.paymentId);

    expect((await paymentsOf(order.code)).payments).toHaveLength(1);
  });

  it("records nothing on a Failed callback and the status poll reports Failed", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper, order.code);

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

    await startIntent(shopper, order.code);

    const foreign = newShopper(server);

    expect(await statusFor(foreign, order.code)).toEqual({ paymentId: null, status: "Processing" });
  });

  it("answers an unknown callback id with 200 and no job", async () => {
    const ack = await postCallback("00000000-0000-0000-0000-000000000000");

    expect(ack.status).toBe(200);
  });

  it("retries by code after Vendure evicted the session pointer, and refuses a foreign session", async () => {
    const { shopper, order } = await placedOrder();
    const intent = await startIntent(shopper, order.code);

    barion.setStatus(intent.paymentId, "Failed");
    await postCallback(intent.paymentId);
    await waitFor(
      order.code,
      async () => (await statusFor(shopper, order.code)).status === "Failed"
    );

    // The first activeOrder resolution after placement evicts the session's
    // pointer (core's "regular process was interrupted" cleanup): exactly the
    // state a buyer is in when they come back from the gateway.
    await expect(activeOrder(shopper)).rejects.toThrow();

    const retried = await startIntent(shopper, order.code);

    expect(retried.paymentId).not.toBe(intent.paymentId);

    const foreign = await run(
      newShopper(server).client,
      INTENT_QUERY,
      { orderCode: order.code },
      z.unknown()
    ).catch((e: unknown) => e);

    expect(foreign).toBeInstanceOf(Error);
    expect(decodeRefusal((foreign as Error).message)?.code).toBe("BARION_ORDER_STATE");
  });

  it("renders the failed payment's order as the session's pending basket until it settles", async () => {
    const { shopper, order } = await placedOrder();

    // Before any intent there is nothing pending.
    const before = await run(shopper.client, PENDING_QUERY, {}, PendingSchema);

    expect(before.barionPendingOrder).toBeNull();

    const intent = await startIntent(shopper, order.code);

    barion.setStatus(intent.paymentId, "Failed");
    await postCallback(intent.paymentId);
    await waitFor(
      order.code,
      async () => (await statusFor(shopper, order.code)).status === "Failed"
    );

    const pending = await run(shopper.client, PENDING_QUERY, {}, PendingSchema);

    expect(pending.barionPendingOrder).toMatchObject({
      code: order.code,
      totalQuantity: order.totalQuantity,
    });

    // Settled: the order leaves the basket for good.
    const retried = await startIntent(shopper, order.code);
    barion.setStatus(retried.paymentId, "Succeeded", [
      { transactionId: "tx-2", total: order.totalWithTax, type: "CardPayment" },
    ]);
    await postCallback(retried.paymentId);
    await waitFor(order.code, (current) => Promise.resolve(current.state === "PaymentSettled"));

    const settled = await run(shopper.client, PENDING_QUERY, {}, PendingSchema);

    expect(settled.barionPendingOrder).toBeNull();
  });

  it("switches the pending order to bank transfer: the Barion track closes and the pending basket ends", async () => {
    const { shopper, order } = await placedOrder();

    // An abandoned Processing intent: the buyer closed the gateway page.
    await startIntent(shopper, order.code);

    const SWITCH_MUTATION = `mutation($orderCode: String!) { switchPendingOrderToBankTransfer(orderCode: $orderCode) }`;

    const foreign = await run(
      newShopper(server).client,
      SWITCH_MUTATION,
      { orderCode: order.code },
      z.unknown()
    ).catch((e: unknown) => e);

    expect(foreign).toBeInstanceOf(Error);
    expect(decodeRefusal((foreign as Error).message)?.code).toBe("BARION_ORDER_STATE");

    const switched = await run(
      shopper.client,
      SWITCH_MUTATION,
      { orderCode: order.code },
      z.object({ switchPendingOrderToBankTransfer: z.string() })
    );

    expect(switched.switchPendingOrderToBankTransfer).toBe(order.code);

    // The pending basket is gone, and it stays gone across a reload (the
    // store's fallback re-queries exactly this).
    const pending = await run(shopper.client, PENDING_QUERY, {}, PendingSchema);

    expect(pending.barionPendingOrder).toBeNull();

    // The confirmation page reports the closed track, and a Barion retry is
    // refused: the díjbekérő path replaced the gateway payment.
    const status = await statusFor(shopper, order.code);

    expect(status.status).toBe("Switched");

    const retried = await run(
      shopper.client,
      INTENT_QUERY,
      { orderCode: order.code },
      z.unknown()
    ).catch((e: unknown) => e);

    expect(retried).toBeInstanceOf(Error);
    expect(decodeRefusal((retried as Error).message)?.code).toBe("BARION_ORDER_STATE");
  });
});
