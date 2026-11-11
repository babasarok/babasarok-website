import type { AddressPart, CheckoutMissing, Refusal } from "../../shared/refusal";

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

function missingAddressParts(facts: AddressFacts): AddressPart[] {
  const parts: AddressPart[] = [];

  if (facts.street.trim() === "") {
    parts.push("STREET");
  }

  if (facts.houseNumber.trim() === "") {
    parts.push("HOUSE_NUMBER");
  }

  if (facts.postalCode.trim() === "") {
    parts.push("POSTAL_CODE");
  }

  if (facts.city.trim() === "") {
    parts.push("CITY");
  }

  return parts;
}

/** What an order still lacks before it can be placed, or undefined when it is complete. */
export function checkoutRefusal(facts: CheckoutFacts): Refusal | undefined {
  const missing: CheckoutMissing[] = [];

  if (facts.lineCount === 0) {
    missing.push("LINE");
  }

  if (!facts.hasCustomer) {
    missing.push("CUSTOMER");
  }

  if (!facts.hasShippingMethod) {
    missing.push("SHIPPING_METHOD");
  }

  if (!facts.termsAccepted) {
    missing.push("TERMS");
  }

  const addressParts = facts.shippingMethodRequiresAddress
    ? missingAddressParts(facts.address)
    : [];

  if (missing.length === 0 && addressParts.length === 0) {
    return undefined;
  }

  return { code: "CHECKOUT_INCOMPLETE", missing, addressParts };
}
