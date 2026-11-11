import { messages } from "../../shared/messages";

export interface AddressFacts {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

export interface CheckoutFacts {
  lineCount: number;
  hasCustomer: boolean;
  hasShippingMethod: boolean;
  termsAccepted: boolean;
  shippingMethodRequiresAddress: boolean;
  address: AddressFacts;
}

function missingAddressParts(facts: AddressFacts, m: ReturnType<typeof messages>): string[] {
  const parts: string[] = [];

  if (facts.street.trim() === "") {
    parts.push(m.addressStreet());
  }

  if (facts.houseNumber.trim() === "") {
    parts.push(m.addressHouseNumber());
  }

  if (facts.postalCode.trim() === "") {
    parts.push(m.addressPostalCode());
  }

  if (facts.city.trim() === "") {
    parts.push(m.addressCity());
  }

  return parts;
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

  if (facts.shippingMethodRequiresAddress) {
    const parts = missingAddressParts(facts.address, m);

    if (parts.length > 0) {
      missing.push(m.checkoutMissingAddress(parts.join(", ")));
    }
  }

  if (!facts.termsAccepted) {
    missing.push(m.checkoutMissingTerms());
  }

  if (missing.length === 0) {
    return undefined;
  }

  return m.checkoutMissing(missing.join(", "));
}
