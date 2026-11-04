import { z } from "zod";
import type { BasketApi } from "./api";
import type { Order } from "./schemas";
import { SHIPPING_COUNTRY_CODE } from "./submit";

export interface ContactDraft {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  address: string;
  message: string;
}

export type ContactSave = "customer" | "address" | "message";

export const EMPTY_CONTACT: ContactDraft = {
  lastName: "",
  firstName: "",
  email: "",
  phone: "",
  address: "",
  message: "",
};

export function draftFromOrder(order: Order): ContactDraft {
  const customer = order.customer;

  return {
    lastName: customer?.lastName ?? "",
    firstName: customer?.firstName ?? "",
    email: customer?.emailAddress ?? "",
    phone: customer?.phoneNumber ?? "",
    address: order.shippingAddress?.streetLine1 ?? "",
    message: order.customFields?.message ?? "",
  };
}

function customerUpdate(
  saved: ContactDraft,
  current: ContactDraft
): Pick<ContactDraft, "lastName" | "firstName" | "email" | "phone"> | null {
  const email = z.email().safeParse(current.email.trim()).success ? current.email : saved.email;
  const nameComplete =
    current.lastName.trim() !== "" && current.firstName.trim() !== "";
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

export function pendingSaves(saved: ContactDraft, current: ContactDraft): ContactSave[] {
  const saves: ContactSave[] = [];

  if (customerUpdate(saved, current) !== null) {
    saves.push("customer");
  }

  if (saved.address !== current.address) {
    saves.push("address");
  }

  if (saved.message !== current.message) {
    saves.push("message");
  }

  return saves;
}

export type ContactApi = Pick<
  BasketApi,
  "setCustomer" | "setShippingAddress" | "setOrderCustomFields"
>;

export interface ContactSaver {
  adopt(draft: ContactDraft): void;
  save(): Promise<void>;
}

export function createContactSaver(api: ContactApi, read: () => ContactDraft): ContactSaver {
  let saved = EMPTY_CONTACT;
  let queue: Promise<void> = Promise.resolve();

  async function run(): Promise<void> {
    const current = read();

    for (const save of pendingSaves(saved, current)) {
      if (save === "customer") {
        const update = customerUpdate(saved, current);

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
          saved = {
            ...saved,
            lastName: update.lastName,
            firstName: update.firstName,
            email: update.email,
            phone: update.phone,
          };
        }
      }

      if (save === "address") {
        const result = await api.setShippingAddress(current.address.trim(), SHIPPING_COUNTRY_CODE);

        if (result.ok) {
          saved = { ...saved, address: current.address };
        }
      }

      if (save === "message") {
        const result = await api.setOrderCustomFields({ message: current.message });

        if (result.ok) {
          saved = { ...saved, message: current.message };
        }
      }
    }
  }

  return {
    adopt(draft: ContactDraft): void {
      saved = draft;
    },
    save(): Promise<void> {
      queue = queue.then(run);

      return queue;
    },
  };
}
