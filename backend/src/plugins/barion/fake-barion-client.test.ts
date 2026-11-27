import { describe, expect, it } from "vitest";
import { FakeBarionClient } from "./fake-barion-client";

const REQUEST = {
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

describe("FakeBarionClient", () => {
  it("starts payments as Processing and hands out a gateway URL", async () => {
    const client = new FakeBarionClient();
    const started = await client.startPayment(REQUEST);

    expect(started.gatewayUrl).toMatch(/^https:\/\/secure/);
    expect((await client.getPaymentState(started.paymentId)).status).toBe("Started");
  });

  it("keeps the request for assertions", async () => {
    const client = new FakeBarionClient();

    await client.startPayment(REQUEST);

    expect(client.requestsFor("ABCD1234").at(0)?.total).toBe(26_500);
  });

  it("drives success and decline through the test seam", async () => {
    const client = new FakeBarionClient();
    const started = await client.startPayment(REQUEST);

    client.setStatus(started.paymentId, "Succeeded", [
      { transactionId: "tx-1", total: 26_500, type: "CardPayment" },
    ]);
    expect(await client.getPaymentState(started.paymentId)).toMatchObject({ status: "Succeeded" });

    client.setStatus(started.paymentId, "Failed");
    expect(await client.getPaymentState(started.paymentId)).toMatchObject({ status: "Failed" });
  });

  it("refunds only Succeeded payments and records the requests", async () => {
    const client = new FakeBarionClient();
    const started = await client.startPayment(REQUEST);

    await expect(
      client.refundPayment({ paymentId: started.paymentId, total: 26_500 })
    ).rejects.toMatchObject({
      failure: { kind: "rejected" },
    });

    client.setStatus(started.paymentId, "Succeeded");
    await client.refundPayment({ paymentId: started.paymentId, total: 26_500 });

    expect(client.refundRequests).toEqual([{ paymentId: started.paymentId, total: 26_500 }]);
  });

  it("answers a rejected state for an unknown payment", async () => {
    const client = new FakeBarionClient();

    await expect(client.getPaymentState("nope")).rejects.toMatchObject({
      failure: { kind: "rejected" },
    });
  });
});
