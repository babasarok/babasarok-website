import type { BasketApi, Failure, Result } from "./api";
import type { Order, ShippingQuote } from "./schemas";
import { requiresAddress } from "./schemas";
import { billingAddressInput, type CheckoutDrafts } from "./drafts";

export const DEFAULT_COUNTRY = "HU";

const GENERIC_ERROR =
  "Hiba történt a rendelés elküldése közben. Kérlek, próbáld meg újra később.";

export interface SubmitInput {
  drafts: CheckoutDrafts;
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
  const { drafts } = input;
  const customer = await api.setCustomer({
    emailAddress: drafts.contact.email.trim(),
    phoneNumber: drafts.contact.phone.trim(),
    firstName: drafts.contact.firstName.trim(),
    lastName: drafts.contact.lastName.trim(),
  });

  if (!customer.ok) {
    return customer;
  }

  if (requiresAddress(input.shippingMethod)) {
    const address = await api.setShippingAddress({
      streetLine1: drafts.address.street.trim(),
      streetLine2: drafts.address.houseNumber.trim(),
      postalCode: drafts.address.postalCode.trim(),
      city: drafts.address.city.trim(),
      countryCode: drafts.address.country,
    });

    if (!address.ok) {
      return address;
    }
  }

  const method = await api.setShippingMethod(input.shippingMethod.id);

  if (!method.ok) {
    return method;
  }

  const billingInput = billingAddressInput(drafts.billing, drafts.address, input.shippingMethod);

  if (billingInput === null) {
    const unset = await api.unsetBillingAddress();

    if (!unset.ok) {
      return unset;
    }
  } else {
    const billing = await api.setBillingAddress(billingInput);

    if (!billing.ok) {
      return billing;
    }
  }

  const fields = await api.setOrderCustomFields({
    message: drafts.message,
    termsAccepted: input.termsAccepted,
    taxNumber: drafts.billing.taxNumber,
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
