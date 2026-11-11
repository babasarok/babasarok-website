import type { AddressInput, CustomerInput } from "./api";
import { requiresAddress, type Order, type OrderAddress, type ShippingQuote } from "./schemas";

export const DEFAULT_COUNTRY = "HU";

/** The `name` of every checkout input: the forms render them, the parsers read them. */
export const FIELD = {
  lastName: "lastName",
  firstName: "firstName",
  email: "email",
  phone: "phone",
  street: "street",
  houseNumber: "houseNumber",
  postalCode: "postalCode",
  city: "city",
  country: "country",
  sameAsShipping: "sameAsShipping",
  fullName: "fullName",
  company: "company",
  taxNumber: "taxNumber",
  message: "message",
  terms: "terms",
} as const;

export interface ContactValues {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
}

export interface AddressValues {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface BillingValues {
  sameAsShipping: boolean;
  fullName: string;
  address: AddressValues;
  company: string;
  taxNumber: string;
}

export interface CheckoutValues {
  contact: ContactValues;
  address: AddressValues;
  billing: BillingValues;
  message: string;
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

function addressValues(address: OrderAddress | null): AddressValues {
  return {
    street: text(address?.streetLine1),
    houseNumber: text(address?.streetLine2),
    postalCode: text(address?.postalCode),
    city: text(address?.city),
    country: address?.countryCode ?? DEFAULT_COUNTRY,
  };
}

function stored(address: OrderAddress | null): boolean {
  if (address === null) {
    return false;
  }

  return [
    address.fullName,
    address.streetLine1,
    address.streetLine2,
    address.postalCode,
    address.city,
  ].some((value) => text(value).trim() !== "");
}

/** Vendure returns an all-null address object rather than null when none is set. */
export function hasBillingAddress(order: Order): boolean {
  return stored(order.billingAddress);
}

export function hasShippingAddress(order: Order): boolean {
  return stored(order.shippingAddress);
}

/** What the order holds, in the shape the checkout forms show. */
export function valuesFromOrder(order: Order): CheckoutValues {
  const customer = order.customer;
  const billing = order.billingAddress;
  const billingStored = stored(billing);

  return {
    contact: {
      lastName: text(customer?.lastName),
      firstName: text(customer?.firstName),
      email: text(customer?.emailAddress),
      phone: text(customer?.phoneNumber),
    },
    address: addressValues(order.shippingAddress),
    billing: {
      sameAsShipping: !billingStored,
      fullName: billingStored ? text(billing?.fullName) : "",
      address: billingStored ? addressValues(billing) : addressValues(null),
      company: billingStored ? text(billing?.company) : text(order.shippingAddress?.company),
      taxNumber: text(order.customFields?.taxNumber),
    },
    message: text(order.customFields?.message),
  };
}

function field(data: FormData, name: string): string {
  const value = data.get(name);

  return typeof value === "string" ? value.trim() : "";
}

export function contactFromForm(data: FormData): ContactValues {
  return {
    lastName: field(data, FIELD.lastName),
    firstName: field(data, FIELD.firstName),
    email: field(data, FIELD.email),
    phone: field(data, FIELD.phone),
  };
}

export function addressFromForm(data: FormData): AddressValues {
  return {
    street: field(data, FIELD.street),
    houseNumber: field(data, FIELD.houseNumber),
    postalCode: field(data, FIELD.postalCode),
    city: field(data, FIELD.city),
    country: field(data, FIELD.country) || DEFAULT_COUNTRY,
  };
}

export function billingFromForm(data: FormData): BillingValues {
  return {
    sameAsShipping: data.has(FIELD.sameAsShipping),
    fullName: field(data, FIELD.fullName),
    address: addressFromForm(data),
    company: field(data, FIELD.company),
    taxNumber: field(data, FIELD.taxNumber),
  };
}

export function messageFromForm(data: FormData): string {
  return field(data, FIELD.message);
}

/**
 * The billing step collects its own address when the buyer unticks "same as
 * shipping", or when the delivery method has no delivery address to be the
 * same as — then the billing address is the buyer's mandatory address.
 */
export function billingUsesOwnFields(
  billing: BillingValues,
  method: ShippingQuote | undefined
): boolean {
  return !requiresAddress(method) || !billing.sameAsShipping;
}

export function customerInput(contact: ContactValues): CustomerInput {
  return {
    emailAddress: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phoneNumber: contact.phone,
  };
}

export interface Recipient {
  fullName: string;
  phoneNumber: string;
}

export function recipientOf(contact: ContactValues): Recipient {
  return {
    fullName: [contact.lastName, contact.firstName].filter((part) => part !== "").join(" "),
    phoneNumber: contact.phone,
  };
}

export function shippingAddressInput(
  address: AddressValues,
  recipient: Recipient,
  company: string
): AddressInput {
  return {
    fullName: recipient.fullName,
    phoneNumber: recipient.phoneNumber,
    company,
    streetLine1: address.street,
    streetLine2: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.country,
  };
}

/**
 * Where the billing step's data lands natively: its own billing address
 * (company included) when it collects one, otherwise no billing address and
 * the company on the delivery address — the invoice buyer is then the
 * delivery address.
 */
export interface BillingPlan {
  billingAddress: AddressInput | null;
  shippingCompany: string;
}

export function billingPlan(
  billing: BillingValues,
  method: ShippingQuote | undefined
): BillingPlan {
  if (!billingUsesOwnFields(billing, method)) {
    return { billingAddress: null, shippingCompany: billing.company };
  }

  return {
    billingAddress: {
      fullName: billing.fullName,
      company: billing.company,
      streetLine1: billing.address.street,
      streetLine2: billing.address.houseNumber,
      postalCode: billing.address.postalCode,
      city: billing.address.city,
      countryCode: billing.address.country,
    },
    shippingCompany: "",
  };
}
