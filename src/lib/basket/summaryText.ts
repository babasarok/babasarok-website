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

function labelled(label: string, value: string): string {
  if (!present(value)) {
    return "";
  }

  return `${label}: ${value}`;
}

function addressLines(address: AddressValues, t: T): string[] {
  const street = joined([address.street, address.houseNumber], " ");
  const locality = joined([address.postalCode, address.city], " ");

  if (street === "" && locality === "") {
    return [];
  }

  const country = address.country === "HU" ? t("checkout.countryHU") : address.country;

  return [street, locality, country].filter(present);
}

function companyLines(billing: BillingValues, t: T): string[] {
  return [
    labelled(t("checkout.company"), billing.company),
    labelled(t("checkout.taxNumber"), billing.taxNumber),
  ].filter(present);
}

/** One entry per detail of the Kapcsolat step, as the review lists them. */
export function contactLines(contact: ContactValues): string[] {
  return [joined([contact.lastName, contact.firstName], " "), contact.email, contact.phone].filter(
    present
  );
}

export function shippingLines(
  method: ShippingQuote | undefined,
  address: AddressValues,
  currencyCode: string,
  t: T
): string[] {
  if (method === undefined) {
    return [];
  }

  const name = `${method.name} · ${formatMoney(method.priceWithTax, currencyCode)}`;

  if (!requiresAddress(method)) {
    return [name];
  }

  return [name, ...addressLines(address, t)];
}

export function billingLines(
  billing: BillingValues,
  method: ShippingQuote | undefined,
  t: T
): string[] {
  const company = companyLines(billing, t);

  if (!billingUsesOwnFields(billing, method)) {
    return [t("checkout.sameAsShipping"), ...company];
  }

  const own = [billing.fullName, ...addressLines(billing.address, t)].filter(present);

  if (own.length === 0 && company.length === 0) {
    return [t("checkout.noBilling")];
  }

  return [...own, ...company];
}

/** The one-line form of a step's details, for the collapsed step summaries. */
export function summaryLine(lines: readonly string[]): string {
  return lines.join(" · ");
}
