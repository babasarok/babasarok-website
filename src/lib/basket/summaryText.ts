import {
  billingUsesOwnFields,
  type AddressValues,
  type BillingValues,
  type ContactValues,
} from "./checkoutValues";
import { formatMoney } from "./money";
import { requiresAddress, type ShippingQuote } from "./schemas";

export type T = (key: string, vars?: Record<string, unknown>) => string;

function present(value: string): boolean {
  return value.trim() !== "";
}

function joined(parts: readonly string[], separator: string): string {
  return parts.filter(present).join(separator);
}

export function contactSummary(contact: ContactValues): string {
  return joined(
    [joined([contact.lastName, contact.firstName], " "), contact.email, contact.phone],
    " · "
  );
}

function addressLine(address: AddressValues, t: T): string {
  const street = joined([address.street, address.houseNumber], " ");
  const locality = joined([address.postalCode, address.city], " ");

  if (street === "" && locality === "") {
    return "";
  }

  const country = address.country === "HU" ? t("checkout.countryHU") : address.country;

  return joined([street, locality, country], ", ");
}

export function shippingSummary(
  method: ShippingQuote | undefined,
  address: AddressValues,
  currencyCode: string,
  t: T
): string {
  if (method === undefined) {
    return "";
  }

  const name = `${method.name} · ${formatMoney(method.priceWithTax, currencyCode)}`;

  if (!requiresAddress(method)) {
    return name;
  }

  return joined([name, addressLine(address, t)], " · ");
}

export function billingSummary(
  billing: BillingValues,
  method: ShippingQuote | undefined,
  t: T
): string {
  const company = joined([billing.company, billing.taxNumber], " · ");

  if (!billingUsesOwnFields(billing, method)) {
    return joined([t("checkout.sameAsShipping"), company], " · ");
  }

  const own = joined([billing.fullName, addressLine(billing.address, t), company], " · ");

  if (own === "") {
    return t("checkout.noBilling");
  }

  return own;
}
