import { formatMoney } from "./money";
import { depositAmount, type ShippingQuote } from "./schemas";

/**
 * The deferred delivery variant's deposit disclosure (ADR 0021 §1): the
 * deposit paid at placement and the remainder collected at handover,
 * formatted for the buyer — null for a full-prepay variant. The deposit
 * never exceeds the total (mirrors the backend's arrangement clamp).
 */
export function depositDisclosure(
  method: ShippingQuote | undefined,
  totalWithTax: number,
  currency: string
): { deposit: string; remainder: string } | null {
  const deposit = depositAmount(method);

  if (deposit <= 0) {
    return null;
  }

  const payable = Math.min(deposit, totalWithTax);

  return {
    deposit: formatMoney(payable, currency),
    remainder: formatMoney(totalWithTax - payable, currency),
  };
}
