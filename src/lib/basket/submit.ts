import type { BasketApi, Failure, Result } from "./api";
import { requiresAddress, type Order, type ShippingQuote } from "./schemas";
import {
  billingPlan,
  customerInput,
  recipientOf,
  shippingAddressInput,
  type CheckoutValues,
} from "./checkoutValues";

const GENERIC_ERROR =
  "Hiba történt a rendelés elküldése közben. Kérlek, próbáld meg újra később.";

export interface SubmitInput {
  values: CheckoutValues;
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

async function runSequence(api: BasketApi, input: SubmitInput): Promise<Result<Order>> {
  const { values, shippingMethod } = input;
  const customer = await api.setCustomer(customerInput(values.contact));

  if (!customer.ok) {
    return customer;
  }

  const plan = billingPlan(values.billing, shippingMethod);

  if (requiresAddress(shippingMethod)) {
    const address = await api.setShippingAddress(
      shippingAddressInput(values.address, recipientOf(values.contact), plan.shippingCompany)
    );

    if (!address.ok) {
      return address;
    }
  }

  const method = await api.setShippingMethod(shippingMethod.id);

  if (!method.ok) {
    return method;
  }

  const billing =
    plan.billingAddress === null
      ? await api.unsetBillingAddress()
      : await api.setBillingAddress(plan.billingAddress);

  if (!billing.ok) {
    return billing;
  }

  const fields = await api.setOrderCustomFields({
    message: values.message,
    termsAccepted: input.termsAccepted,
    taxNumber: values.billing.taxNumber,
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
