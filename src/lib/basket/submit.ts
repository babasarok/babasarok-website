import type { BasketApi, Failure, Result } from "./api";
import type { Order, ShippingQuote } from "./schemas";
import { requiresAddress } from "./readiness";

export const SHIPPING_COUNTRY_CODE = "HU";

const GENERIC_ERROR =
  "Hiba történt az árajánlatkérés elküldése közben. Kérlek, próbáld meg újra később.";

export interface SubmitInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  message: string;
  shippingMethod: ShippingQuote;
  termsAccepted: boolean;
  transactionId: string;
}

export type SubmitResult =
  { ok: true; order: Order } | { ok: false; message: string; reference: string };

export interface OrderErrorReport {
  message: string;
  stack: string | undefined;
  reference: string;
}

export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return { lastName: parts[0], firstName: parts.slice(1).join(" ") };
}

async function runSequence(api: BasketApi, input: SubmitInput): Promise<Result<Order>> {
  const customer = await api.setCustomer({
    emailAddress: input.email.trim(),
    phoneNumber: input.phone.trim(),
    ...splitName(input.name),
  });

  if (!customer.ok) {
    return customer;
  }

  if (requiresAddress(input.shippingMethod)) {
    const address = await api.setShippingAddress(input.address.trim(), SHIPPING_COUNTRY_CODE);

    if (!address.ok) {
      return address;
    }
  }

  const method = await api.setShippingMethod(input.shippingMethod.id);

  if (!method.ok) {
    return method;
  }

  const fields = await api.setOrderCustomFields({
    message: input.message,
    termsAccepted: input.termsAccepted,
    submissionTransactionId: input.transactionId,
  });

  if (!fields.ok) {
    return fields;
  }

  return api.transitionToArrangingPayment();
}

function describe(failure: Failure, reference: string): string {
  return `${GENERIC_ERROR} (${failure.reason}, kód: ${reference})`;
}

export async function placeOrder(
  api: BasketApi,
  input: SubmitInput,
  report: (report: OrderErrorReport) => void
): Promise<SubmitResult> {
  const result = await runSequence(api, input);

  if (result.ok) {
    return { ok: true, order: result.value };
  }

  const reference = input.transactionId.slice(0, 8);

  report({ message: result.failure.detail, stack: result.failure.stack, reference });

  return { ok: false, message: describe(result.failure, reference), reference };
}
