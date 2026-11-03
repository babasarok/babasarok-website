import type { Order, ShippingQuote } from "./schemas";

export interface CheckoutDraft {
  name: string;
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
    return { field: "lines", message: "A kosarad üres." };
  }

  if (order.lines.some((line) => line.invalidReason !== null)) {
    return {
      field: "invalid",
      message:
        "Néhány termék már nem rendelhető így. Szerkeszd vagy told ki a megjelölt tételeket, utána leadhatod a rendelést.",
    };
  }

  if (draft.name.trim() === "") {
    return { field: "name", message: "Kérem, add meg a neved." };
  }

  if (draft.email.trim() === "") {
    return { field: "email", message: "Kérem, add meg az email címed." };
  }

  if (!draft.termsAccepted) {
    return { field: "terms", message: "Az ÁSZF elfogadása kötelező." };
  }

  const method = selectedMethod(methods, draft.shippingMethodId);

  if (method === undefined) {
    return { field: "method", message: "Kérem, válassz egy szállítási módot." };
  }

  if (method.customFields?.requiresAddress === true && draft.address.trim() === "") {
    return { field: "address", message: "Kérem, add meg a szállítási címet a szállítási módhoz." };
  }

  return undefined;
}

export function requiresAddress(method: ShippingQuote | undefined): boolean {
  return method?.customFields?.requiresAddress === true;
}
