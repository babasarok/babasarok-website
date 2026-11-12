import type { BasketApi, Result } from "./api";
import type { Reason } from "./refusalText";
import { requiresAddress, type Order, type ShippingQuote } from "./schemas";
import {
  billingPlan,
  customerInput,
  recipientOf,
  shippingAddressInput,
  type CheckoutValues,
} from "./checkoutValues";

export interface SubmitInput {
  values: CheckoutValues;
  shippingMethod: ShippingQuote;
  termsAccepted: boolean;
  /** The active order's code — the buyer-facing failure reference. */
  orderCode: string;
}

export type SubmitResult = { ok: true; order: Order } | { ok: false; failure: SubmitFailure };

/** Shown as `errors.submit`; the reason is an i18n key or the server's own localized message. */
export interface SubmitFailure {
  reason: Reason;
  reference: string;
}

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
  });

  if (!fields.ok) {
    return fields;
  }

  return api.transitionToArrangingPayment();
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

  const reference = input.orderCode;

  report({ message: result.failure.detail, stack: result.failure.stack, reference });

  return { ok: false, failure: { reason: result.failure.reason, reference } };
}
