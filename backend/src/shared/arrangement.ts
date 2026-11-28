/**
 * The order's payment arrangement, resolved from the selected delivery
 * variant's `deposit` custom field — the arrangement axis's single source
 * (ADR 0021 §1): 0 = full prepay, > 0 = the deposit collected at placement,
 * the remainder at handover. The field rides the variant, not GLS as such,
 * so any future deferred variant carries the same arrangement. The deposit
 * never exceeds the order's total: an order cheaper than the deposit is
 * fully prepaid by its deposit payment.
 */
export type PaymentArrangement = { kind: "full" } | { kind: "deposit"; deposit: number };

/** The slice of a placed order the arrangement reads. */
export interface ArrangementOrder {
  totalWithTax: number;
  shippingLines: { shippingMethod?: { customFields?: { deposit?: number } | null } | null }[];
}

export function paymentArrangement(order: ArrangementOrder): PaymentArrangement {
  const variantDeposit = order.shippingLines[0]?.shippingMethod?.customFields?.deposit ?? 0;

  if (variantDeposit > 0) {
    return { kind: "deposit", deposit: Math.min(variantDeposit, order.totalWithTax) };
  }

  return { kind: "full" };
}
