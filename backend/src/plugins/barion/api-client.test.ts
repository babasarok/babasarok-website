import { describe, expect, it } from "vitest";
import { createBarionApiClient } from "./api-client";
import { BarionError } from "./barion-client";

const POS_KEY = "12345678-abcd-abcd-abcd-123456789012";

function clientFor(responses: { status: number; body: unknown }[]): {
  client: ReturnType<typeof createBarionApiClient>;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  const doFetch = (async (url: string | URL, init?: RequestInit) => {
    const response = responses.shift();
    const headers = Object.fromEntries(Object.entries(init?.headers ?? {}));

    calls.push({
      url: String(url),
      body: typeof init?.body === "string" ? init.body : "",
      headers,
    });

    if (!response) {
      throw new Error("no scripted response left");
    }

    return Response.json(response.body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return {
    client: createBarionApiClient({ mode: "live", posKey: POS_KEY, fetch: doFetch }),
    calls,
  };
}

interface RecordedCall {
  url: string;
  body: string;
  headers: Record<string, string>;
}

const START_REQUEST = {
  paymentRequestId: "ABCD1234-1",
  currencyCode: "HUF",
  locale: "hu-HU",
  total: 26_500,
  payeeEmail: "bolt@babasarok.test",
  redirectUrl: "https://babasarok.net/payment/confirmation?orderCode=ABCD1234",
  callbackUrl: "https://api.babasarok.net/payments/barion/callback",
  items: [{ name: "Párna", quantity: 2, unitPrice: 12_500, total: 25_000 }],
  payer: null,
};

describe("createBarionApiClient", () => {
  it("starts the payment on the v2 endpoint and returns the gateway coordinates", async () => {
    const { client, calls } = clientFor([
      {
        status: 200,
        body: {
          PaymentId: "guid-1",
          GatewayUrl: "https://secure.barion.com/pay?t=guid-1",
          Status: "Started",
        },
      },
    ]);

    const started = await client.startPayment(START_REQUEST);

    expect(started).toEqual({
      paymentId: "guid-1",
      gatewayUrl: "https://secure.barion.com/pay?t=guid-1",
      status: "Started",
    });
    expect(calls[0].url).toBe("https://api.barion.com/v2/Payment/Start");

    const body = JSON.parse(calls[0].body) as Record<string, unknown>;

    expect(body).toMatchObject({
      POSKey: POS_KEY,
      PaymentType: "Immediate",
      GuestCheckOut: true,
      PaymentRequestId: "ABCD1234-1",
      Currency: "HUF",
      Locale: "hu-HU",
      Total: 26_500,
    });
    expect(body).not.toHaveProperty("PayerHint");
  });

  it("queries the v4 paymentstate with the x-pos-key header", async () => {
    const { client, calls } = clientFor([
      {
        status: 200,
        body: {
          Status: "Succeeded",
          Transactions: [{ TransactionId: "tx-1", Total: 26_500, Type: "CardPayment" }],
        },
      },
    ]);

    const state = await client.getPaymentState("guid-1");

    expect(state).toEqual({
      status: "Succeeded",
      transactions: [{ transactionId: "tx-1", total: 26_500, type: "CardPayment" }],
    });
    expect(calls[0].url).toBe("https://api.barion.com/v4/payment/guid-1/paymentstate");
    expect(calls[0].headers["x-pos-key"]).toBe(POS_KEY);
  });

  it("maps Barion's error list to a typed rejection", async () => {
    const { client } = clientFor([
      {
        status: 400,
        body: {
          Errors: [
            { ErrorCode: "NotExistingCurrency", Description: "The POS doesn't have an account." },
          ],
        },
      },
    ]);

    await expect(client.startPayment(START_REQUEST)).rejects.toMatchObject({
      name: "BarionError",
      failure: {
        kind: "rejected",
        errors: [{ code: "NotExistingCurrency", description: "The POS doesn't have an account." }],
      },
    });
  });

  it("maps HTTP 429 to the rate-limited failure", async () => {
    const { client } = clientFor([{ status: 429, body: {} }]);

    const error = await client.getPaymentState("guid-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BarionError);
    expect((error as BarionError).failure).toEqual({ kind: "rateLimited" });
  });

  it("refunds across the payment's transactions", async () => {
    const { client, calls } = clientFor([
      {
        status: 200,
        body: {
          Status: "Succeeded",
          Transactions: [
            { TransactionId: "tx-1", Total: 20_000, Type: "CardPayment" },
            { TransactionId: "tx-2", Total: 6500, Type: "CardPayment" },
          ],
        },
      },
      { status: 200, body: {} },
    ]);

    await client.refundPayment({ paymentId: "guid-1", total: 26_500 });

    const body = JSON.parse(calls[1].body) as {
      TransactionsToRefund: { TransactionId: string; Total: number }[];
    };

    expect(calls[1].url).toBe("https://api.barion.com/v2/Payment/Refund");
    expect(body.TransactionsToRefund).toEqual([
      { TransactionId: "tx-1", Total: 20_000 },
      { TransactionId: "tx-2", Total: 6500 },
    ]);
  });
});
