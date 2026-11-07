import type { Order, ShippingQuote } from "./schemas";

export interface CheckoutDraft {
  lastName: string;
  firstName: string;
  email: string;
  address: string;
  termsAccepted: boolean;
  shippingMethodId: string;
}

export type CheckoutBlocker = {
  field: "lines" | "invalid" | "name" | "email" | "terms" | "method" | "address";
  message: string;
};

export function selectedMethod(
  methods: readonly ShippingQuote[],
  shippingMethodId: string
): ShippingQuote | undefined {
  return methods.find((method) => method.id === shippingMethodId);
}

export function checkoutBlocker(
  order: Order | null,
  methods: readonly ShippingQuote[],
  draft: CheckoutDraft
): CheckoutBlocker | undefined {
  if (order === null || order.lines.length === 0) {
    return { field: "lines", message: "blockers.empty" };
  }

  if (order.lines.some((line) => line.invalidReason !== null)) {
    return {
      field: "invalid",
      message: "blockers.invalid",
    };
  }

  if (draft.lastName.trim() === "" || draft.firstName.trim() === "") {
    return { field: "name", message: "blockers.name" };
  }

  if (draft.email.trim() === "") {
    return { field: "email", message: "blockers.email" };
  }

  if (!draft.termsAccepted) {
    return { field: "terms", message: "blockers.terms" };
  }

  const method = selectedMethod(methods, draft.shippingMethodId);

  if (method === undefined) {
    return { field: "method", message: "blockers.method" };
  }

  if (method.customFields?.requiresAddress === true && draft.address.trim() === "") {
    return { field: "address", message: "blockers.address" };
  }

  return undefined;
}

export function requiresAddress(method: ShippingQuote | undefined): boolean {
  return method?.customFields?.requiresAddress === true;
}
