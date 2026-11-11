import { describe, expect, it } from "vitest";
import type { AddressInput, OrderCustomFieldsInput, Result } from "./api";
import { createCheckoutSaves, type CheckoutSaves, type SaveApi } from "./checkoutSaves";
import type { BillingValues } from "./checkoutValues";
import type { Order, OrderAddress, ShippingQuote } from "./schemas";

const gls: ShippingQuote = {
  id: "8",
  name: "GLS",
  description: "",
  priceWithTax: 2500,
  customFields: { requiresAddress: true },
};

const none: OrderAddress = {
  fullName: null,
  company: null,
  streetLine1: null,
  streetLine2: null,
  postalCode: null,
  city: null,
  countryCode: null,
};

function toAddress(input: AddressInput): OrderAddress {
  return {
    fullName: input.fullName ?? null,
    company: input.company ?? null,
    streetLine1: input.streetLine1,
    streetLine2: input.streetLine2 ?? null,
    postalCode: input.postalCode ?? null,
    city: input.city ?? null,
    countryCode: input.countryCode,
  };
}

interface FakeShop {
  api: SaveApi;
  saves: CheckoutSaves;
  calls: string[];
  current: () => Order | null;
}

/** A fake shop API holding one order, answering every mutation with the updated order. */
function fakeShop(initial: Partial<Order> = {}): FakeShop {
  let order: Order = {
    id: "1",
    code: "ABC",
    state: "AddingItems",
    currencyCode: "HUF",
    totalQuantity: 1,
    subTotalWithTax: 0,
    shippingWithTax: 0,
    totalWithTax: 0,
    discounts: [],
    shippingLines: [],
    customer: {
      firstName: "Anna",
      lastName: "Kovács",
      emailAddress: "a@b.hu",
      phoneNumber: "+3630",
    },
    shippingAddress: none,
    billingAddress: none,
    customFields: { message: null, taxNumber: null },
    lines: [],
    ...initial,
  };
  let live: Order | null = order;
  const calls: string[] = [];

  function respond(name: string, next: Order): Promise<Result<Order>> {
    calls.push(name);
    order = next;

    return Promise.resolve({ ok: true, value: next });
  }

  const api: SaveApi = {
    setCustomer: (input) =>
      respond("setCustomer", {
        ...order,
        customer: {
          firstName: input.firstName,
          lastName: input.lastName,
          emailAddress: input.emailAddress,
          phoneNumber: input.phoneNumber,
        },
      }),
    setShippingAddress: (input) =>
      respond("setShippingAddress", { ...order, shippingAddress: toAddress(input) }),
    setBillingAddress: (input) =>
      respond("setBillingAddress", { ...order, billingAddress: toAddress(input) }),
    unsetBillingAddress: () => respond("unsetBillingAddress", { ...order, billingAddress: none }),
    setShippingMethod: (id) =>
      respond("setShippingMethod", {
        ...order,
        shippingLines: [{ priceWithTax: 0, discountedPriceWithTax: 0, shippingMethod: { id } }],
      }),
    setOrderCustomFields: (input: OrderCustomFieldsInput) =>
      respond("setOrderCustomFields", {
        ...order,
        customFields: {
          message: input.message ?? order.customFields?.message ?? null,
          taxNumber: input.taxNumber ?? order.customFields?.taxNumber ?? null,
        },
      }),
  };

  const saves = createCheckoutSaves(api, {
    order: () => live,
    apply: (result) => {
      if (result.ok) {
        live = result.value;
      }

      return result;
    },
  });

  return { api, saves, calls, current: () => live };
}

const address = {
  street: "Fő u.",
  houseNumber: "1.",
  postalCode: "3894",
  city: "Telkibánya",
  country: "HU",
};

const ticked: BillingValues = {
  sameAsShipping: true,
  fullName: "",
  address: { street: "", houseNumber: "", postalCode: "", city: "", country: "HU" },
  company: "Minta Kft.",
  taxNumber: "123",
};

describe("createCheckoutSaves", () => {
  it("applies each response so the next save reads the updated order", async () => {
    const shop = fakeShop({ customer: null });

    void shop.saves.contact({
      lastName: "Teszt",
      firstName: "Elek",
      email: "e@b.hu",
      phone: "+3620",
    });
    void shop.saves.shipping(address);
    await shop.saves.settled();

    expect(shop.calls).toEqual(["setCustomer", "setShippingAddress"]);
    expect(shop.current()?.shippingAddress).toMatchObject({
      fullName: "Teszt Elek",
      streetLine2: "1.",
    });
  });

  it("keeps the stored delivery-address company when the delivery step is saved", async () => {
    const shop = fakeShop({
      shippingAddress: { ...none, streetLine1: "Régi u.", company: "Minta Kft." },
    });

    await shop.saves.shipping(address);

    expect(shop.current()?.shippingAddress?.company).toBe("Minta Kft.");
  });

  it("stores no billing address when ticked and moves the company onto the delivery address", async () => {
    const shop = fakeShop({
      shippingAddress: toAddress({ streetLine1: "Fő u.", countryCode: "HU" }),
      billingAddress: toAddress({
        fullName: "Régi",
        company: "Régi Kft.",
        streetLine1: "Piac tér",
        countryCode: "HU",
      }),
    });

    await shop.saves.billing(ticked, gls);

    expect(shop.calls).toEqual([
      "unsetBillingAddress",
      "setShippingAddress",
      "setOrderCustomFields",
    ]);
    expect(shop.current()?.billingAddress?.streetLine1).toBeNull();
    expect(shop.current()?.shippingAddress?.company).toBe("Minta Kft.");
    expect(shop.current()?.customFields?.taxNumber).toBe("123");
  });

  it("clears the delivery-address company once the billing address carries it", async () => {
    const shop = fakeShop({
      shippingAddress: toAddress({
        company: "Minta Kft.",
        streetLine1: "Fő u.",
        countryCode: "HU",
      }),
    });

    await shop.saves.billing(
      { ...ticked, sameAsShipping: false, fullName: "Számla Név", address },
      gls
    );

    expect(shop.current()?.billingAddress?.company).toBe("Minta Kft.");
    expect(shop.current()?.shippingAddress?.company).toBe("");
  });

  it("does not resave an unchanged ticked billing step", async () => {
    const shop = fakeShop({
      shippingAddress: toAddress({
        company: "Minta Kft.",
        streetLine1: "Fő u.",
        countryCode: "HU",
      }),
    });

    await shop.saves.billing(ticked, gls);

    expect(shop.calls).toEqual(["setOrderCustomFields"]);
  });

  it("reports whether the order took a delivery method", async () => {
    const shop = fakeShop();
    const refusing = createCheckoutSaves(
      {
        ...shop.api,
        setShippingMethod: () =>
          Promise.resolve({ ok: false, failure: { reason: "r", detail: "d" } }),
      },
      { order: shop.current, apply: (result) => result }
    );

    expect(await refusing.method("8")).toBe(false);
    expect(await shop.saves.method("8")).toBe(true);
  });

  it("does nothing without an active order", async () => {
    const shop = fakeShop();
    const saves = createCheckoutSaves(shop.api, { order: () => null, apply: (result) => result });

    await saves.message("szia");

    expect(shop.calls).toEqual([]);
  });
});
