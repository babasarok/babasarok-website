import { z } from "zod";
import type { BasketApi } from "./api";
import type { Order } from "./schemas";
import { SHIPPING_COUNTRY_CODE, splitName } from "./submit";

export interface ContactDraft {
  name: string;
  email: string;
  phone: string;
  address: string;
  message: string;
}

export type ContactSave = "customer" | "address" | "message";

export const EMPTY_CONTACT: ContactDraft = {
  name: "",
  email: "",
  phone: "",
  address: "",
  message: "",
};

export function draftFromOrder(order: Order): ContactDraft {
  const customer = order.customer;

  return {
    name: [customer?.lastName, customer?.firstName].filter(Boolean).join(" "),
    email: customer?.emailAddress ?? "",
    phone: customer?.phoneNumber ?? "",
    address: order.shippingAddress?.streetLine1 ?? "",
    message: order.customFields?.message ?? "",
  };
}

function canSaveCustomer(draft: ContactDraft): boolean {
  return draft.name.trim() !== "" && z.email().safeParse(draft.email.trim()).success;
}

export function pendingSaves(saved: ContactDraft, current: ContactDraft): ContactSave[] {
  const saves: ContactSave[] = [];

  if (
    (saved.name !== current.name ||
      saved.email !== current.email ||
      saved.phone !== current.phone) &&
    canSaveCustomer(current)
  ) {
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
        const result = await api.setCustomer({
          emailAddress: current.email.trim(),
          phoneNumber: current.phone.trim(),
          ...splitName(current.name),
        });

        if (result.ok) {
          saved = { ...saved, name: current.name, email: current.email, phone: current.phone };
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
