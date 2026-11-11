import {
  billingUsesOwnFields,
  type AddressValues,
  type BillingValues,
  type ContactValues,
} from "./checkoutValues";
import { formatMoney } from "./money";
import { requiresAddress, type ShippingQuote } from "./schemas";

export type T = (key: string, vars?: Record<string, unknown>) => string;

/** One labelled detail of a checkout step, as the review lists it. */
export interface DetailRow {
  label: string;
  value: string;
}

/** What the order charges for its delivery, next to the method's own price. */
export interface ShippingFee {
  listPrice: number;
  charged: number;
}

function present(value: string): boolean {
  return value.trim() !== "";
}

function joined(parts: readonly string[], separator: string): string {
  return parts.filter(present).join(separator);
}

function rows(entries: readonly DetailRow[]): DetailRow[] {
  return entries.filter((row) => present(row.value));
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

function companyRows(billing: BillingValues, t: T): DetailRow[] {
  return rows([
    { label: t("checkout.company"), value: billing.company },
    { label: t("checkout.taxNumber"), value: billing.taxNumber },
  ]);
}

export function contactRows(contact: ContactValues, t: T): DetailRow[] {
  return rows([
    { label: t("checkout.detail.name"), value: joined([contact.lastName, contact.firstName], " ") },
    { label: t("checkout.detail.email"), value: contact.email },
    { label: t("checkout.detail.phone"), value: contact.phone },
  ]);
}

export function shippingRows(
  method: ShippingQuote | undefined,
  address: AddressValues,
  fee: ShippingFee,
  currencyCode: string,
  t: T
): DetailRow[] {
  if (method === undefined) {
    return [];
  }

  const price =
    fee.listPrice > 0 && fee.charged === 0
      ? t("checkout.free")
      : formatMoney(fee.charged, currencyCode);
  const delivery = [
    { label: t("checkout.detail.method"), value: method.name },
    { label: t("checkout.detail.fee"), value: price },
  ];

  if (!requiresAddress(method)) {
    return rows(delivery);
  }

  return rows([
    ...delivery,
    { label: t("checkout.detail.address"), value: addressLine(address, t) },
  ]);
}

export function billingRows(
  billing: BillingValues,
  method: ShippingQuote | undefined,
  t: T
): DetailRow[] {
  const company = companyRows(billing, t);

  if (!billingUsesOwnFields(billing, method)) {
    return [
      { label: t("checkout.detail.address"), value: t("checkout.sameAsShipping") },
      ...company,
    ];
  }

  const own = rows([
    { label: t("checkout.detail.name"), value: billing.fullName },
    { label: t("checkout.detail.address"), value: addressLine(billing.address, t) },
  ]);

  if (own.length === 0 && company.length === 0) {
    return [{ label: t("checkout.detail.address"), value: t("checkout.noBilling") }];
  }

  return [...own, ...company];
}

/** The one-line form of a step's details, for the collapsed step summaries. */
export function summaryLine(details: readonly DetailRow[]): string {
  return details.map((row) => row.value).join(" · ");
}
