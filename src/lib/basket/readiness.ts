import { requiresAddress, type Order, type ShippingQuote } from "./schemas";
import {
  billingUsesOwnFields,
  type AddressValues,
  type BillingValues,
  type CheckoutValues,
  type ContactValues,
} from "./checkoutValues";
import { STEPS, stepIndex, type StepId } from "./steps";

export interface FieldCheck {
  /** The form field to mark invalid, or "step" when the step lacks a field to point at. */
  field: string;
  /** The i18n key of the refusal. */
  message: string;
}

export function selectedMethod(
  methods: readonly ShippingQuote[],
  shippingMethodId: string | undefined
): ShippingQuote | undefined {
  return methods.find((method) => method.id === shippingMethodId);
}

/** The order's delivery method, when it is still among the eligible ones. */
export function orderMethod(
  order: Order | null,
  methods: readonly ShippingQuote[]
): ShippingQuote | undefined {
  return selectedMethod(methods, order?.shippingLines.at(0)?.shippingMethod.id);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactCheck(contact: ContactValues): FieldCheck | undefined {
  if (contact.lastName === "" || contact.firstName === "") {
    return { field: "name", message: "blockers.name" };
  }

  if (!EMAIL_PATTERN.test(contact.email)) {
    return { field: "email", message: "blockers.email" };
  }

  return undefined;
}

function addressMissingPart(address: AddressValues): FieldCheck | undefined {
  if (address.street === "") {
    return { field: "street", message: "blockers.street" };
  }

  if (address.houseNumber === "") {
    return { field: "houseNumber", message: "blockers.houseNumber" };
  }

  if (address.postalCode === "") {
    return { field: "postalCode", message: "blockers.postalCode" };
  }

  if (address.city === "") {
    return { field: "city", message: "blockers.city" };
  }

  return undefined;
}

export function shippingCheck(
  address: AddressValues,
  method: ShippingQuote | undefined
): FieldCheck | undefined {
  if (method === undefined) {
    return { field: "method", message: "blockers.method" };
  }

  if (requiresAddress(method)) {
    return addressMissingPart(address);
  }

  return undefined;
}

export function billingCheck(
  billing: BillingValues,
  method: ShippingQuote | undefined
): FieldCheck | undefined {
  if (!billingUsesOwnFields(billing, method)) {
    return undefined;
  }

  if (billing.fullName === "") {
    return { field: "fullName", message: "blockers.fullName" };
  }

  return addressMissingPart(billing.address);
}

export function reviewCheck(termsAccepted: boolean): FieldCheck | undefined {
  if (!termsAccepted) {
    return { field: "terms", message: "blockers.terms" };
  }

  return undefined;
}

/** The order-level blockers no step field owns. */
export function orderBlocker(order: Order | null): FieldCheck | undefined {
  if (order === null || order.lines.length === 0) {
    return { field: "step", message: "blockers.empty" };
  }

  if (order.lines.some((line) => line.invalidReason !== null)) {
    return { field: "step", message: "blockers.invalid" };
  }

  return undefined;
}

/** The first step whose saved data is incomplete; the review step always passes. */
export function furthestStep(values: CheckoutValues, method: ShippingQuote | undefined): StepId {
  const checks = [
    contactCheck(values.contact),
    shippingCheck(values.address, method),
    billingCheck(values.billing, method),
  ];
  const index = checks.findIndex((check) => check !== undefined);

  if (index === -1) {
    return "review";
  }

  return STEPS[index].id;
}

/**
 * The step to open on load: the hash's step, clamped back to the saved data
 * when the hash is absent or ahead of what the order has.
 */
export function entryStep(
  values: CheckoutValues,
  method: ShippingQuote | undefined,
  hashStep: StepId | undefined
): StepId {
  const derived = furthestStep(values, method);

  if (hashStep === undefined || stepIndex(hashStep) > stepIndex(derived)) {
    return derived;
  }

  return hashStep;
}
