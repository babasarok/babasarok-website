import { LanguageCode, PaymentMethodHandler } from "@vendure/core";
import { z } from "zod";
import type { BarionClient } from "./barion-client";
import { BARION_CLIENT } from "./barion.service";

/**
 * The metadata the callback job hands to the handler (the Mollie pattern:
 * the amount comes from the metadata — what the gateway actually charged —
 * not from the passed-in amount).
 */
export const BarionPaymentMetadataSchema = z.object({
  role: z.enum(["full", "deposit"]),
  barionPaymentId: z.string().min(1),
  amount: z.number().int().positive(),
  currencyCode: z.string().min(3),
  barionStatus: z.string().min(1),
});

export type BarionPaymentMetadata = z.output<typeof BarionPaymentMetadataSchema>;

export const BARION_PAYMENT_METHOD_CODE = "barion";

let client: BarionClient | undefined;

/**
 * Records the settled Barion payment on the order. Only the callback path may
 * create it: the shop API never drives this handler — the buyer pays on the
 * gateway, the callback re-queries the state, and this records the money.
 */
export const barionHandler = new PaymentMethodHandler({
  code: BARION_PAYMENT_METHOD_CODE,
  description: [
    {
      languageCode: LanguageCode.hu,
      value:
        "Barion bankkártyás fizetés: a rendelés teljes összegének előrefizetése a Barion Smart Gatewayen",
    },
  ],
  args: {},
  init(injector) {
    client = injector.get<BarionClient>(BARION_CLIENT);
  },
  createPayment: (ctx, _order, _amount, _args, metadata) => {
    if (ctx.apiType !== "admin" && ctx.apiType !== "custom") {
      throw new Error("A Barion fizetést kizárólag a fizetés-visszaigazolás rögzítheti.");
    }

    const parsed = BarionPaymentMetadataSchema.safeParse(metadata);

    if (!parsed.success) {
      throw new Error(`A Barion fizetés metaadatai hiányosak: ${parsed.error.message}`);
    }

    return {
      amount: parsed.data.amount,
      state: "Settled",
      transactionId: parsed.data.barionPaymentId,
      metadata,
    };
  },
  settlePayment: () => ({ success: true }),
  createRefund: async (_ctx, _input, amount, _order, payment) => {
    if (!client) {
      throw new Error("A Barion kliens nem áll rendelkezésre (a handler nem inicializált).");
    }

    await client.refundPayment({
      paymentId: payment.transactionId,
      total: Math.min(amount, payment.amount),
    });

    return { state: "Settled" };
  },
});
