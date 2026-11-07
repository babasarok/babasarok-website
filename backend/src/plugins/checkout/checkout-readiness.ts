export interface CheckoutFacts {
  lineCount: number;
  hasCustomer: boolean;
  hasShippingMethod: boolean;
  termsAccepted: boolean;
  shippingMethodRequiresAddress: boolean;
  hasAddress: boolean;
}

/**
 * The Hungarian refusal naming what an order still lacks before it can be
 * placed, or undefined when it is complete.
 */
export function checkoutRefusal(facts: CheckoutFacts): string | undefined {
  const missing: string[] = [];

  if (facts.lineCount === 0) {
    missing.push("legalább egy termék");
  }

  if (!facts.hasCustomer) {
    missing.push("a vevő adatai");
  }

  if (!facts.hasShippingMethod) {
    missing.push("a szállítási mód");
  }

  if (facts.shippingMethodRequiresAddress && !facts.hasAddress) {
    missing.push("a szállítási cím");
  }

  if (!facts.termsAccepted) {
    missing.push("az ÁSZF elfogadása");
  }

  if (missing.length === 0) {
    return undefined;
  }

  return `A rendelés nem adható le, hiányzik: ${missing.join(", ")}.`;
}
