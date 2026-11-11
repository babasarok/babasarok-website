import {
  billingUsesOwnFields,
  type AddressDraft,
  type BillingDraft,
  type ContactDraft,
} from "./drafts";
import { formatMoney } from "./money";
import type { ShippingQuote } from "./schemas";

export type T = (key: string, vars?: Record<string, unknown>) => string;

const DEFAULT_CURRENCY = "HUF";

function present(value: string): boolean {
  return value.trim() !== "";
}

function joined(parts: readonly string[], separator: string): string {
  return parts.filter(present).join(separator);
}

export function contactSummary(contact: ContactDraft): string {
  return joined(
    [joined([contact.lastName, contact.firstName], " "), contact.email, contact.phone],
    " · "
  );
}

function addressLine(address: AddressDraft, t: T): string {
  const street = joined([address.street, address.houseNumber], " ");
  const locality = joined([address.postalCode, address.city], " ");

  if (street === "" && locality === "") {
    return "";
  }

  const country = address.country === "HU" ? t("checkout.countryHU") : address.country;

  return joined([street, locality, country], ", ");
}

function companySuffix(billing: BillingDraft): string {
  const parts = joined([billing.company, billing.taxNumber], " · ");

  return parts === "" ? "" : ` · ${parts}`;
}

export function shippingSummary(
  method: ShippingQuote | undefined,
  address: AddressDraft,
  t: T,
  currencyCode: string = DEFAULT_CURRENCY
): string {
  if (method === undefined) {
    return "";
  }

  return `${method.name} · ${formatMoney(method.priceWithTax, currencyCode)}`;
}

export function billingSummary(
  billing: BillingDraft,
  method: ShippingQuote | undefined,
  t: T
): string {
  const company = companySuffix(billing);

  if (!billingUsesOwnFields(billing, method)) {
    return t("checkout.sameAsShipping") + company;
  }

  const line = addressLine(billing.address, t);

  if (line === "" && company === "") {
    return t("checkout.noBilling");
  }

  if (line === "") {
    return company.replace(/^ · /, "");
  }

  return line + company;
}
