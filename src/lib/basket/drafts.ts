import { z } from "zod";
import type { AddressInput, BasketApi } from "./api";
import type { Order, ShippingQuote } from "./schemas";
import { requiresAddress } from "./schemas";
import { DEFAULT_COUNTRY } from "./submit";

export interface ContactDraft {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
}

export interface AddressDraft {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface BillingDraft {
  sameAsShipping: boolean;
  address: AddressDraft;
  company: string;
  taxNumber: string;
}

export interface CheckoutDrafts {
  contact: ContactDraft;
  address: AddressDraft;
  billing: BillingDraft;
  message: string;
}

/** Which stored parts of the active order the drafts differ from. */
export type SaveKind = "customer" | "shipping" | "billing" | "message";

export const EMPTY_ADDRESS: AddressDraft = {
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  country: DEFAULT_COUNTRY,
};

export const EMPTY_CONTACT: ContactDraft = { lastName: "", firstName: "", email: "", phone: "" };

export const EMPTY_BILLING: BillingDraft = {
  sameAsShipping: true,
  address: EMPTY_ADDRESS,
  company: "",
  taxNumber: "",
};

export const EMPTY_DRAFTS: CheckoutDrafts = {
  contact: EMPTY_CONTACT,
  address: EMPTY_ADDRESS,
  billing: EMPTY_BILLING,
  message: "",
};

export function draftsFromOrder(order: Order): CheckoutDrafts {
  const customer = order.customer;
  const shipping = order.shippingAddress;
  const billing = order.billingAddress;
  const billingStored =
    billing !== null &&
    [billing.company, billing.streetLine1, billing.streetLine2, billing.postalCode, billing.city].some(
      (value) => (value ?? "").trim() !== ""
    );

  return {
    contact: {
      lastName: customer?.lastName ?? "",
      firstName: customer?.firstName ?? "",
      email: customer?.emailAddress ?? "",
      phone: customer?.phoneNumber ?? "",
    },
    address: {
      street: shipping?.streetLine1 ?? "",
      houseNumber: shipping?.streetLine2 ?? "",
      postalCode: shipping?.postalCode ?? "",
      city: shipping?.city ?? "",
      country: shipping?.countryCode ?? DEFAULT_COUNTRY,
    },
    billing: {
      sameAsShipping: !billingStored,
      address: {
        street: billing?.streetLine1 ?? "",
        houseNumber: billing?.streetLine2 ?? "",
        postalCode: billing?.postalCode ?? "",
        city: billing?.city ?? "",
        country: billing?.countryCode ?? DEFAULT_COUNTRY,
      },
      company: billing?.company ?? "",
      taxNumber: order.customFields?.taxNumber ?? "",
    },
    message: order.customFields?.message ?? "",
  };
}

function customerUpdate(
  saved: ContactDraft,
  current: ContactDraft
): ContactDraft | null {
  const email = z.email().safeParse(current.email.trim()).success ? current.email : saved.email;
  const nameComplete = current.lastName.trim() !== "" && current.firstName.trim() !== "";
  const lastName = nameComplete ? current.lastName : saved.lastName;
  const firstName = nameComplete ? current.firstName : saved.firstName;
  const update = { lastName, firstName, email, phone: current.phone };

  if (
    update.lastName === saved.lastName &&
    update.firstName === saved.firstName &&
    update.email === saved.email &&
    update.phone === saved.phone
  ) {
    return null;
  }

  return update;
}

function sameAddress(a: AddressDraft, b: AddressDraft): boolean {
  return (
    a.street === b.street &&
    a.houseNumber === b.houseNumber &&
    a.postalCode === b.postalCode &&
    a.city === b.city &&
    a.country === b.country
  );
}

function sameBilling(a: BillingDraft, b: BillingDraft): boolean {
  return (
    a.sameAsShipping === b.sameAsShipping &&
    a.company === b.company &&
    a.taxNumber === b.taxNumber &&
    sameAddress(a.address, b.address)
  );
}

export function pendingSaves(saved: CheckoutDrafts, current: CheckoutDrafts): SaveKind[] {
  const saves: SaveKind[] = [];

  if (customerUpdate(saved.contact, current.contact) !== null) {
    saves.push("customer");
  }

  if (!sameAddress(saved.address, current.address)) {
    saves.push("shipping");
  }

  if (!sameBilling(saved.billing, current.billing)) {
    saves.push("billing");
  }

  if (saved.message !== current.message) {
    saves.push("message");
  }

  return saves;
}

export type DraftApi = Pick<
  BasketApi,
  "setCustomer" | "setShippingAddress" | "setBillingAddress" | "unsetBillingAddress" | "setOrderCustomFields"
>;

export interface DraftSaver {
  adopt(drafts: CheckoutDrafts): void;
  save(): Promise<void>;
}

/**
 * The billing step collects its own address when the addresses are split, or
 * when the delivery method has no delivery address to be the same as — then
 * the billing address is the buyer's mandatory address.
 */
export function billingUsesOwnFields(
  billing: BillingDraft,
  method: ShippingQuote | undefined
): boolean {
  return !requiresAddress(method) || !billing.sameAsShipping;
}

/**
 * The billing address as the order stores it: the billing step's own fields
 * when the buyer split the addresses (or the method has no delivery address),
 * the shipping address carrying the company when they did not. Null when
 * nothing needs storing — the caller unsets the order's billing address then.
 */
export function billingAddressInput(
  billing: BillingDraft,
  shipping: AddressDraft,
  method: ShippingQuote | undefined
): AddressInput | null {
  if (!billingUsesOwnFields(billing, method)) {
    if (billing.company.trim() === "") {
      return null;
    }

    return {
      company: billing.company,
      streetLine1: shipping.street,
      streetLine2: shipping.houseNumber,
      postalCode: shipping.postalCode,
      city: shipping.city,
      countryCode: shipping.country,
    };
  }

  return {
    company: billing.company,
    streetLine1: billing.address.street,
    streetLine2: billing.address.houseNumber,
    postalCode: billing.address.postalCode,
    city: billing.address.city,
    countryCode: billing.address.country,
  };
}

/**
 * When the delivery method has no delivery address, the billing step takes
 * over as the buyer's address: the toggle goes away and the fields start
 * from the shipping address the buyer may already have typed.
 */
export function adoptPickupBilling(drafts: CheckoutDrafts): CheckoutDrafts {
  const empty =
    drafts.billing.address.street.trim() === "" &&
    drafts.billing.address.houseNumber.trim() === "" &&
    drafts.billing.address.postalCode.trim() === "" &&
    drafts.billing.address.city.trim() === "";

  if (!empty) {
    return { ...drafts, billing: { ...drafts.billing, sameAsShipping: false } };
  }

  return {
    ...drafts,
    billing: { ...drafts.billing, sameAsShipping: false, address: drafts.address },
  };
}

function shippingInput(address: AddressDraft): AddressInput {
  return {
    streetLine1: address.street,
    streetLine2: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.country,
  };
}

/** The drafts the island edits, plus the delivery method the method-dependent parts need. */
export interface DraftSource {
  drafts: CheckoutDrafts;
  method: ShippingQuote | undefined;
}

export function createDraftSaver(api: DraftApi, read: () => DraftSource): DraftSaver {
  let saved = EMPTY_DRAFTS;
  let queue: Promise<void> = Promise.resolve();

  async function run(): Promise<void> {
    const current = read();

    for (const save of pendingSaves(saved, current.drafts)) {
      const drafts = current.drafts;

      if (save === "customer") {
        const update = customerUpdate(saved.contact, drafts.contact);

        if (update === null) {
          continue;
        }

        const result = await api.setCustomer({
          emailAddress: update.email.trim(),
          phoneNumber: update.phone.trim(),
          firstName: update.firstName.trim(),
          lastName: update.lastName.trim(),
        });

        if (result.ok) {
          saved = { ...saved, contact: update };
        }
      }

      if (save === "shipping") {
        const result = await api.setShippingAddress(shippingInput(drafts.address));

        if (result.ok) {
          saved = { ...saved, address: drafts.address };
        }
      }

      if (save === "billing") {
        const input = billingAddressInput(drafts.billing, drafts.address, current.method);
        const result =
          input === null ? await api.unsetBillingAddress() : await api.setBillingAddress(input);

        if (result.ok) {
          const fields = await api.setOrderCustomFields({ taxNumber: drafts.billing.taxNumber });

          if (fields.ok) {
            saved = { ...saved, billing: drafts.billing };
          }
        }
      }

      if (save === "message") {
        const result = await api.setOrderCustomFields({ message: drafts.message });

        if (result.ok) {
          saved = { ...saved, message: drafts.message };
        }
      }
    }
  }

  return {
    adopt(drafts: CheckoutDrafts): void {
      saved = drafts;
    },
    save(): Promise<void> {
      queue = queue.then(run);

      return queue;
    },
  };
}
