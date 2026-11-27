import { z } from "zod";

/**
 * The Barion site-side contract (ADR 0021 §2, §5): the payment intent the
 * checkout opens, the status the confirmation page polls, and the coded
 * refusals the shop API answers with. Slice 1 is full-prepay only.
 */

export const PAYMENT_METHODS = ["barion", "bank-transfer"] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

/** Today's behavior: the order parks in ArrangingPayment, the owner emails a díjbekérő. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethodId = "bank-transfer";

export const BarionIntentSchema = z.object({
  paymentId: z.string().min(1),
  gatewayUrl: z.url({ protocol: /^https$/ }),
});

export type BarionIntent = z.output<typeof BarionIntentSchema>;

export const BarionPaymentStatusSchema = z.object({
  paymentId: z.string().nullable(),
  status: z.enum(["Processing", "Succeeded", "Failed", "Expired"]),
});

export type BarionPaymentStatus = z.output<typeof BarionPaymentStatusSchema>;

const ConfirmationParamsSchema = z.object({
  orderCode: z.string().min(1),
  // Barion appends it to the redirect; the wizard's failure redirect omits it.
  paymentId: z.string().min(1).optional(),
});

export type ConfirmationParams = z.output<typeof ConfirmationParamsSchema>;

/** The redirect's query (`orderCode` + optional `paymentId`), or undefined when it carries neither. */
export function parseConfirmationParams(params: URLSearchParams): ConfirmationParams | undefined {
  const parsed = ConfirmationParamsSchema.safeParse({
    orderCode: params.get("orderCode") ?? undefined,
    paymentId: params.get("paymentId") ?? undefined,
  });

  return parsed.success ? parsed.data : undefined;
}

/** How often the confirmation page re-reads the order's payment status. */
export const POLL_INTERVAL_MS = 3000;

/** The bounded poll after the gateway redirect (Barion prescribes fallback polling, not floods). */
export const POLL_BUDGET_MS = 5 * 60_000;

/**
 * What the confirmation page shows, from the polled status and the time spent
 * polling only — never from the redirect itself.
 */
export type ConfirmationView = "processing" | "succeeded" | "failed" | "stalled";

export function confirmationView(status: string | undefined, elapsedMs: number): ConfirmationView {
  if (status === "Succeeded") {
    return "succeeded";
  }

  if (status === "Failed" || status === "Expired") {
    return "failed";
  }

  if (elapsedMs >= POLL_BUDGET_MS) {
    return "stalled";
  }

  return "processing";
}

/**
 * The Barion refusal codes the shop API answers a refused payment intent with,
 * worded in the locale dictionaries. The refusal travels inside error text
 * (the coded-refusal pattern): the scan finds the code wherever it sits.
 */
const BARION_REFUSAL_PATTERN = /"code"\s*:\s*"(BARION_INTENT_FAILED|BARION_ORDER_STATE)"/;

export function barionRefusalKey(text: string): string | undefined {
  const match = BARION_REFUSAL_PATTERN.exec(text);

  return match === null ? undefined : `refusals.${match[1]}`;
}
