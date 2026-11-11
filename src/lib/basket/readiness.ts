import type { Order, ShippingQuote } from "./schemas";
import { requiresAddress } from "./schemas";
import { billingUsesOwnFields, type AddressDraft, type BillingDraft, type CheckoutDrafts, type ContactDraft } from "./drafts";
import { STEPS, stepIndex, type StepId } from "./steps";

export interface FieldCheck {
  /** The form field to mark invalid, or "step" when the step lacks a field to point at. */
  field: string;
  /** The i18n key of the refusal. */
  message: string;
}

export function selectedMethod(
  methods: readonly ShippingQuote[],
  shippingMethodId: string
): ShippingQuote | undefined {
  return methods.find((method) => method.id === shippingMethodId);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactCheck(contact: ContactDraft): FieldCheck | undefined {
  if (contact.lastName.trim() === "" || contact.firstName.trim() === "") {
    return { field: "name", message: "blockers.name" };
  }

  if (!EMAIL_PATTERN.test(contact.email.trim())) {
    return { field: "email", message: "blockers.email" };
  }

  return undefined;
}

function addressMissingPart(address: AddressDraft): FieldCheck | undefined {
  if (address.street.trim() === "") {
    return { field: "street", message: "blockers.street" };
  }

  if (address.houseNumber.trim() === "") {
    return { field: "houseNumber", message: "blockers.houseNumber" };
  }

  if (address.postalCode.trim() === "") {
    return { field: "postalCode", message: "blockers.postalCode" };
  }

  if (address.city.trim() === "") {
    return { field: "city", message: "blockers.city" };
  }

  return undefined;
}

export function shippingCheck(
  address: AddressDraft,
  method?: ShippingQuote
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
  billing: BillingDraft,
  method: ShippingQuote | undefined
): FieldCheck | undefined {
  if (billingUsesOwnFields(billing, method)) {
    return addressMissingPart(billing.address);
  }

  return undefined;
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
export function furthestStep(
  order: Order | null,
  methods: readonly ShippingQuote[],
  drafts: CheckoutDrafts
): StepId {
  const methodId = order?.shippingLines.at(0)?.shippingMethod.id ?? "";
  const method = selectedMethod(methods, methodId);
  const checks = [
    contactCheck(drafts.contact),
    shippingCheck(drafts.address, method),
    billingCheck(drafts.billing, method),
  ];

  return STEPS.find((step, index) => checks[index] !== undefined)?.id ?? "review";
}

/**
 * The step to open on load: the hash's step, clamped back to the saved data
 * when the hash is absent or ahead of what the order has.
 */
export function entryStep(
  order: Order | null,
  methods: readonly ShippingQuote[],
  drafts: CheckoutDrafts,
  hashStep?: StepId
): StepId {
  const derived = furthestStep(order, methods, drafts);

  if (hashStep === undefined || stepIndex(hashStep) > stepIndex(derived)) {
    return derived;
  }

  return hashStep;
}
