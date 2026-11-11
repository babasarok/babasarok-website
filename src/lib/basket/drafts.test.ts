import { describe, expect, it, vi, type Mock } from "vitest";
import {
  EMPTY_ADDRESS,
  EMPTY_DRAFTS,
  adoptPickupBilling,
  billingAddressInput,
  createDraftSaver,
  draftsFromOrder,
  pendingSaves,
  type CheckoutDrafts,
  type DraftSaver,
} from "./drafts";
import type { Order, ShippingQuote } from "./schemas";

const pickup: ShippingQuote = {
  id: "7",
  name: "Személyes",
  description: "",
  priceWithTax: 0,
  customFields: { requiresAddress: false },
};
const gls: ShippingQuote = { ...pickup, id: "8", customFields: { requiresAddress: true } };

const contact = { lastName: "Teszt", firstName: "Elek", email: "teszt@example.com", phone: "1" };

const filled: CheckoutDrafts = {
  contact,
  address: { street: "Fő u.", houseNumber: "1.", postalCode: "3894", city: "Telkibánya", country: "HU" },
  billing: { sameAsShipping: true, address: EMPTY_ADDRESS, company: "", taxNumber: "" },
  message: "",
};

describe("draftsFromOrder", () => {
  it("restores the saved details as stored and tolerates a bare order", () => {
    const order = {
      customer: { firstName: "Elek", lastName: "Teszt", emailAddress: "teszt@example.com", phoneNumber: "1" },
      shippingAddress: {
        company: null,
        streetLine1: "Fő u.",
        streetLine2: "1.",
        postalCode: "3894",
        city: "Telkibánya",
        countryCode: "HU",
      },
      billingAddress: null,
      customFields: { message: null, taxNumber: null },
    } as Order;

    expect(draftsFromOrder(order)).toEqual(filled);
    expect(draftsFromOrder({ customer: null, shippingAddress: null, billingAddress: null, customFields: null } as Order)).toEqual(
      EMPTY_DRAFTS
    );
  });

  it("treats a stored billing address as a split billing step", () => {
    const order = {
      customer: null,
      shippingAddress: null,
      billingAddress: {
        company: "Minta Kft.",
        streetLine1: "Piac tér",
        streetLine2: "2.",
        postalCode: "1053",
        city: "Budapest",
        countryCode: "HU",
      },
      customFields: { message: null, taxNumber: "12345678-2-42" },
    } as Order;

    expect(draftsFromOrder(order).billing).toEqual({
      sameAsShipping: false,
      address: { street: "Piac tér", houseNumber: "2.", postalCode: "1053", city: "Budapest", country: "HU" },
      company: "Minta Kft.",
      taxNumber: "12345678-2-42",
    });
  });
});

describe("pendingSaves", () => {
  it("saves nothing when nothing changed", () => {
    expect(pendingSaves(filled, filled)).toEqual([]);
  });

  it("saves customer fields independently", () => {
    expect(pendingSaves(EMPTY_DRAFTS, { ...EMPTY_DRAFTS, contact })).toEqual(["customer"]);
    expect(
      pendingSaves(EMPTY_DRAFTS, { ...EMPTY_DRAFTS, contact: { ...contact, email: "nem-email" } })
    ).toEqual(["customer"]);
    expect(pendingSaves(filled, { ...filled, contact: { ...contact, phone: "123" } })).toEqual(["customer"]);
  });

  it("does not fire a customer save when no field is individually valid", () => {
    expect(
      pendingSaves(
        EMPTY_DRAFTS,
        { ...EMPTY_DRAFTS, contact: { ...contact, email: "nem-email", lastName: "", firstName: "", phone: "" } }
      )
    ).toEqual([]);
    expect(
      pendingSaves(filled, { ...filled, contact: { ...contact, email: "nem-email" } })
    ).toEqual([]);
  });

  it("saves each changed group once", () => {
    expect(
      pendingSaves(filled, {
        ...filled,
        address: { ...filled.address, street: "Piac tér" },
        billing: { ...filled.billing, taxNumber: "1" },
        message: "y",
      })
    ).toEqual(["shipping", "billing", "message"]);
  });

  it("saves the billing step when only the toggle changed", () => {
    expect(
      pendingSaves(filled, { ...filled, billing: { ...filled.billing, sameAsShipping: false } })
    ).toEqual(["billing"]);
  });
});

describe("billingAddressInput", () => {
  const shipping = filled.address;

  it("stores nothing when the billing matches shipping and no company is given", () => {
    expect(billingAddressInput(filled.billing, shipping, gls)).toBeNull();
  });

  it("carries the company on the shipping address when the addresses match", () => {
    expect(billingAddressInput({ ...filled.billing, company: "Minta Kft." }, shipping, gls)).toEqual({
      company: "Minta Kft.",
      streetLine1: "Fő u.",
      streetLine2: "1.",
      postalCode: "3894",
      city: "Telkibánya",
      countryCode: "HU",
    });
  });

  it("uses the billing step's own address when the addresses are split", () => {
    const billing = {
      sameAsShipping: false,
      address: { ...EMPTY_ADDRESS, street: "Piac tér", houseNumber: "2.", country: "HU" },
      company: "",
      taxNumber: "",
    };

    expect(billingAddressInput(billing, shipping, gls)).toEqual({
      company: "",
      streetLine1: "Piac tér",
      streetLine2: "2.",
      postalCode: "",
      city: "",
      countryCode: "HU",
    });
  });

  it("always stores the billing address for a method without a delivery address", () => {
    const same = { ...filled.billing, address: EMPTY_ADDRESS };

    expect(billingAddressInput(same, shipping, pickup)).toEqual({
      company: "",
      streetLine1: "",
      streetLine2: "",
      postalCode: "",
      city: "",
      countryCode: "HU",
    });
  });
});

describe("adoptPickupBilling", () => {
  it("splits the billing step and starts from the shipping address when it is empty", () => {
    expect(adoptPickupBilling(filled).billing.sameAsShipping).toBe(false);
    expect(adoptPickupBilling(filled).billing.address).toEqual(filled.address);
  });

  it("keeps billing fields the buyer already typed", () => {
    const typed = {
      ...filled,
      billing: { ...filled.billing, address: { ...EMPTY_ADDRESS, street: "Piac tér" } },
    };

    expect(adoptPickupBilling(typed).billing.address).toEqual({ ...EMPTY_ADDRESS, street: "Piac tér" });
  });
});

describe("createDraftSaver", () => {
  type Call = "setCustomer" | "setShippingAddress" | "setBillingAddress" | "unsetBillingAddress" | "setOrderCustomFields";

  function setup(failAt?: Call): {
    calls: Call[];
    saver: DraftSaver;
    type: (drafts: CheckoutDrafts) => void;
  } {
    const ok = { ok: true as const, value: {} as Order };
    const fail = { ok: false as const, failure: { reason: "r", detail: "d" } };
    const calls: Call[] = [];
    const mock = (name: Call): Mock =>
      vi.fn(() => {
        calls.push(name);

        return Promise.resolve(name === failAt ? fail : ok);
      });
    const api = {
      setCustomer: mock("setCustomer"),
      setShippingAddress: mock("setShippingAddress"),
      setBillingAddress: mock("setBillingAddress"),
      unsetBillingAddress: mock("unsetBillingAddress"),
      setOrderCustomFields: mock("setOrderCustomFields"),
    };
    let current: CheckoutDrafts = EMPTY_DRAFTS;
    const method = gls;
    const saver = createDraftSaver(api, () => ({ drafts: current, method }));

    return {
      calls,
      saver,
      type: (drafts: CheckoutDrafts): void => {
        current = drafts;
      },
    };
  }

  it("saves a change once and not again on the next trigger", async () => {
    const { calls, saver, type } = setup();

    saver.adopt(filled);
    type({ ...filled, message: "szia" });
    await saver.save();
    await saver.save();

    expect(calls).toEqual(["setOrderCustomFields"]);
  });

  it("does not resave what the order already holds", async () => {
    const { calls, saver, type } = setup();

    saver.adopt(filled);
    type(filled);
    await saver.save();

    expect(calls).toEqual([]);
  });

  it("clears the billing address when the toggle returns to same-as-shipping", async () => {
    const { calls, saver, type } = setup();
    const split = {
      ...filled,
      billing: { ...filled.billing, sameAsShipping: false, address: filled.address },
    };

    saver.adopt(split);
    type(filled);
    await saver.save();

    expect(calls).toEqual(["unsetBillingAddress", "setOrderCustomFields"]);
  });

  it("retries a failed save on the next trigger without throwing", async () => {
    const { calls, saver, type } = setup("setCustomer");

    type(filled);
    await saver.save();
    await saver.save();

    expect(calls.filter((call) => call === "setCustomer")).toHaveLength(2);
  });
});
