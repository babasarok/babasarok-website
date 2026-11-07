import { messages } from "../../shared/messages";

export interface CheckoutFacts {
  lineCount: number;
  hasCustomer: boolean;
  hasShippingMethod: boolean;
  termsAccepted: boolean;
  shippingMethodRequiresAddress: boolean;
  hasAddress: boolean;
}

/**
 * The refusal naming what an order still lacks before it can be placed, in
 * the request language, or undefined when it is complete.
 */
export function checkoutRefusal(facts: CheckoutFacts, languageCode: string): string | undefined {
  const m = messages(languageCode);
  const missing: string[] = [];

  if (facts.lineCount === 0) {
    missing.push(m.checkoutMissingLine());
  }

  if (!facts.hasCustomer) {
    missing.push(m.checkoutMissingCustomer());
  }

  if (!facts.hasShippingMethod) {
    missing.push(m.checkoutMissingShippingMethod());
  }

  if (facts.shippingMethodRequiresAddress && !facts.hasAddress) {
    missing.push(m.checkoutMissingAddress());
  }

  if (!facts.termsAccepted) {
    missing.push(m.checkoutMissingTerms());
  }

  if (missing.length === 0) {
    return undefined;
  }

  return m.checkoutMissing(missing.join(", "));
}
