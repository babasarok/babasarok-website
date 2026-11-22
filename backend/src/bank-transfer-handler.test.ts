import {
  Channel,
  LanguageCode,
  Order,
  Payment,
  PaymentMethod,
  RequestContext,
} from "@vendure/core";
import { describe, expect, it } from "vitest";
import { bankTransferChecker, bankTransferHandler } from "./bank-transfer-handler";

const ctx = new RequestContext({
  apiType: "shop",
  isAuthorized: false,
  authorizedAsOwnerOnly: false,
  channel: new Channel(),
  languageCode: LanguageCode.hu,
});

const order = new Order({ subTotalWithTax: 15_000 });
const method = new PaymentMethod();

describe("bankTransferHandler", () => {
  it("settles the payment for the quoted amount", async () => {
    expect(order.totalWithTax).toBe(15_000);

    await expect(
      bankTransferHandler.createPayment(ctx, order, order.totalWithTax, [], {}, method)
    ).resolves.toEqual({ amount: 15_000, state: "Settled", method: "bank-transfer", metadata: {} });
  });

  it("settles an already-created payment on demand", async () => {
    await expect(
      bankTransferHandler.settlePayment(ctx, order, new Payment(), [], method)
    ).resolves.toEqual({ success: true });
  });
});

describe("bankTransferChecker", () => {
  it("refuses every order, so the shop checkout can never offer the method", async () => {
    await expect(bankTransferChecker.check(ctx, order, [], method)).resolves.toBe(false);
  });
});
