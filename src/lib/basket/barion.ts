import { z } from "zod";

/**
 * The Barion site-side contract (ADR 0021 §2, §5): the payment intent the
 * checkout opens, the status the confirmation page polls, and the coded
 * refusals the shop API answers with. Slice 1 is full-prepay only.
 */

export const PAYMENT_METHODS = ["barion", "bank-transfer"] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

export const BarionIntentSchema = z.object({
  paymentId: z.string().min(1),
  gatewayUrl: z.url({ protocol: /^https$/ }),
});

export type BarionIntent = z.output<typeof BarionIntentSchema>;

export const BarionPaymentStatusSchema = z.object({
  paymentId: z.string().nullable(),
  status: z.enum(["Processing", "Succeeded", "Failed", "Expired", "Switched"]),
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

  if (status === "Failed" || status === "Expired" || status === "Switched") {
    // "Switched": the buyer replaced this payment with a bank transfer — an
    // old gateway tab returning sees the closed Barion track, and a retry is
    // refused with the coded order-state refusal.
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

export type BarionRefusalKey = "refusals.BARION_INTENT_FAILED" | "refusals.BARION_ORDER_STATE";

export function barionRefusalKey(text: string): BarionRefusalKey | undefined {
  const match = BARION_REFUSAL_PATTERN.exec(text);

  return match === null ? undefined : (`refusals.${match[1]}` as BarionRefusalKey);
}

/**
 * The wording key for a refused retry: the scanned Barion refusal, or the
 * generic "could not be started" wording for anything else (network errors,
 * uncoded server failures).
 */
export function barionRetryErrorKey(detail: string): BarionRefusalKey {
  return barionRefusalKey(detail) ?? "refusals.BARION_INTENT_FAILED";
}
