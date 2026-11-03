import { describe, expect, it, vi, type Mock } from "vitest";
import {
  EMPTY_CONTACT,
  createContactSaver,
  draftFromOrder,
  pendingSaves,
  type ContactApi,
  type ContactSaver,
  type ContactDraft,
} from "./contactDraft";
import type { Order } from "./schemas";

const filled: ContactDraft = {
  name: "Teszt Elek",
  email: "teszt@example.com",
  phone: "",
  address: "",
  message: "",
};

describe("draftFromOrder", () => {
  it("restores the name surname first and tolerates a bare order", () => {
    const order = {
      customer: { firstName: "Elek", lastName: "Teszt", emailAddress: "a@b.hu", phoneNumber: "1" },
      shippingAddress: { streetLine1: "Fő u. 1" },
      customFields: { message: "szia" },
    } as Order;

    expect(draftFromOrder(order)).toEqual({
      name: "Teszt Elek",
      email: "a@b.hu",
      phone: "1",
      address: "Fő u. 1",
      message: "szia",
    });
    expect(
      draftFromOrder({ customer: null, shippingAddress: null, customFields: null } as Order)
    ).toEqual(EMPTY_CONTACT);
  });
});

describe("pendingSaves", () => {
  it("saves nothing when nothing changed", () => {
    expect(pendingSaves(filled, filled)).toEqual([]);
  });

  it("saves customer fields independently", () => {
    expect(pendingSaves(EMPTY_CONTACT, { ...filled, email: "nem-email" })).toEqual(["customer"]);
    expect(pendingSaves(EMPTY_CONTACT, { ...filled, name: " " })).toEqual(["customer"]);
    expect(pendingSaves(EMPTY_CONTACT, filled)).toEqual(["customer"]);
    expect(pendingSaves(filled, { ...filled, phone: "123" })).toEqual(["customer"]);
  });

  it("does not fire a customer save when no field is individually valid", () => {
    expect(pendingSaves(EMPTY_CONTACT, { ...EMPTY_CONTACT, email: "nem-email" })).toEqual([]);
    expect(pendingSaves(filled, { ...filled, email: "nem-email" })).toEqual([]);
  });

  it("saves only the changed groups", () => {
    expect(pendingSaves(filled, { ...filled, address: "x", message: "y" })).toEqual([
      "address",
      "message",
    ]);
  });
});

describe("createContactSaver", () => {
  function setup(failing = false): {
    setCustomer: Mock;
    setOrderCustomFields: Mock;
    saver: ContactSaver;
    type: (draft: ContactDraft) => void;
  } {
    const ok = { ok: true as const, value: {} as Order };
    const fail = { ok: false as const, failure: { reason: "r", detail: "d" } };
    const setCustomer = vi.fn(() => Promise.resolve(failing ? fail : ok));
    const setOrderCustomFields = vi.fn(() => Promise.resolve(ok));
    const api: ContactApi = {
      setCustomer,
      setShippingAddress: vi.fn(() => Promise.resolve(ok)),
      setOrderCustomFields,
    };
    let current = EMPTY_CONTACT;
    const saver = createContactSaver(api, () => current);

    return {
      setCustomer,
      setOrderCustomFields,
      saver,
      type: (draft: ContactDraft): void => {
        current = draft;
      },
    };
  }

  it("saves a change once, sending only the message custom field", async () => {
    const { setCustomer, setOrderCustomFields, saver, type } = setup();

    type({ ...filled, message: "szia" });
    await saver.save();
    await saver.save();

    expect(setCustomer).toHaveBeenCalledTimes(1);
    expect(setOrderCustomFields).toHaveBeenCalledTimes(1);
    expect(setOrderCustomFields).toHaveBeenCalledWith({ message: "szia" });
  });

  it("does not resave what the order already holds", async () => {
    const { setCustomer, saver, type } = setup();

    saver.adopt(filled);
    type(filled);
    await saver.save();

    expect(setCustomer).not.toHaveBeenCalled();
  });

  it("sends the last good email when only the name changed", async () => {
    const { setCustomer, saver, type } = setup();

    type({ ...EMPTY_CONTACT, name: "Teszt Elek" });
    await saver.save();

    expect(setCustomer).toHaveBeenCalledWith({
      emailAddress: "",
      phoneNumber: "",
      firstName: "Elek",
      lastName: "Teszt",
    });
  });

  it("retries a failed save on the next trigger without throwing", async () => {
    const { setCustomer, saver, type } = setup(true);

    type(filled);
    await saver.save();
    await saver.save();

    expect(setCustomer).toHaveBeenCalledTimes(2);
  });
});
