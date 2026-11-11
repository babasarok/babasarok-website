import { describe, expect, it } from "vitest";
import {
  FIELD,
  billingFromForm,
  billingPlan,
  contactFromForm,
  hasBillingAddress,
  recipientOf,
  shippingAddressInput,
  valuesFromOrder,
  type BillingValues,
} from "./checkoutValues";
import type { Order, OrderAddress, ShippingQuote } from "./schemas";

const pickup: ShippingQuote = {
  id: "7",
  name: "Személyes",
  description: "",
  priceWithTax: 0,
  customFields: { requiresAddress: false },
};
const gls: ShippingQuote = { ...pickup, id: "8", customFields: { requiresAddress: true } };

const none: OrderAddress = {
  fullName: null,
  company: null,
  streetLine1: null,
  streetLine2: null,
  postalCode: null,
  city: null,
  countryCode: null,
};

const shipping: OrderAddress = {
  fullName: "Kovács Anna",
  company: "Minta Kft.",
  streetLine1: "Fő u.",
  streetLine2: "1.",
  postalCode: "3894",
  city: "Telkibánya",
  countryCode: "HU",
};

function order(over: Partial<Order>): Order {
  return {
    id: "1",
    code: "ABC",
    state: "AddingItems",
    currencyCode: "HUF",
    totalQuantity: 0,
    subTotalWithTax: 0,
    shippingWithTax: 0,
    totalWithTax: 0,
    discounts: [],
    shippingLines: [],
    customer: null,
    shippingAddress: none,
    billingAddress: none,
    customFields: null,
    lines: [],
    ...over,
  };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }

  return data;
}

describe("valuesFromOrder", () => {
  it("restores the saved customer, delivery address and message", () => {
    const values = valuesFromOrder(
      order({
        customer: {
          firstName: "Anna",
          lastName: "Kovács",
          emailAddress: "a@b.hu",
          phoneNumber: "+36301234567",
        },
        shippingAddress: shipping,
        customFields: { message: "szia", taxNumber: "123" },
      })
    );

    expect(values.contact).toEqual({
      lastName: "Kovács",
      firstName: "Anna",
      email: "a@b.hu",
      phone: "+36301234567",
    });
    expect(values.address).toEqual({
      street: "Fő u.",
      houseNumber: "1.",
      postalCode: "3894",
      city: "Telkibánya",
      country: "HU",
    });
    expect(values.message).toBe("szia");
  });

  it("is ticked with the delivery address's company when no billing address is stored", () => {
    const values = valuesFromOrder(order({ shippingAddress: shipping }));

    expect(values.billing.sameAsShipping).toBe(true);
    expect(values.billing.company).toBe("Minta Kft.");
  });

  it("is unticked with the billing address's own fields when one is stored", () => {
    const values = valuesFromOrder(
      order({
        shippingAddress: { ...shipping, company: null },
        billingAddress: { ...shipping, fullName: "Számla Név", company: "Másik Kft." },
      })
    );

    expect(values.billing.sameAsShipping).toBe(false);
    expect(values.billing.fullName).toBe("Számla Név");
    expect(values.billing.company).toBe("Másik Kft.");
  });

  it("treats Vendure's all-null address object as no address", () => {
    expect(hasBillingAddress(order({}))).toBe(false);
    expect(valuesFromOrder(order({})).billing.sameAsShipping).toBe(true);
  });
});

describe("reading the forms", () => {
  it("trims what the inputs hold", () => {
    expect(
      contactFromForm(
        form({ [FIELD.lastName]: " Kovács ", [FIELD.firstName]: "Anna", [FIELD.email]: "a@b.hu" })
      )
    ).toEqual({ lastName: "Kovács", firstName: "Anna", email: "a@b.hu", phone: "" });
  });

  it("reads the toggle from the checkbox's presence", () => {
    expect(billingFromForm(form({ [FIELD.sameAsShipping]: "on" })).sameAsShipping).toBe(true);
    expect(billingFromForm(form({})).sameAsShipping).toBe(false);
  });
});

describe("the native mapping", () => {
  const billing: BillingValues = {
    sameAsShipping: true,
    fullName: "",
    address: { street: "", houseNumber: "", postalCode: "", city: "", country: "HU" },
    company: "Minta Kft.",
    taxNumber: "123",
  };

  it("names the delivery recipient surname first, with the phone for the carrier", () => {
    expect(
      recipientOf({ lastName: "Kovács", firstName: "Anna", email: "", phone: "+3630" })
    ).toEqual({ fullName: "Kovács Anna", phoneNumber: "+3630" });
  });

  it("keeps no billing address when ticked and puts the company on the delivery address", () => {
    expect(billingPlan(billing, gls)).toEqual({
      billingAddress: null,
      shippingCompany: "Minta Kft.",
    });
  });

  it("stores the billing address with its company when unticked", () => {
    const plan = billingPlan(
      {
        ...billing,
        sameAsShipping: false,
        fullName: "Számla Név",
        address: {
          street: "Piac tér",
          houseNumber: "2",
          postalCode: "1053",
          city: "Budapest",
          country: "HU",
        },
      },
      gls
    );

    expect(plan).toEqual({
      billingAddress: {
        fullName: "Számla Név",
        company: "Minta Kft.",
        streetLine1: "Piac tér",
        streetLine2: "2",
        postalCode: "1053",
        city: "Budapest",
        countryCode: "HU",
      },
      shippingCompany: "",
    });
  });

  it("always stores the billing address for a method without a delivery address", () => {
    expect(billingPlan(billing, pickup).billingAddress).not.toBeNull();
  });

  it("writes the structured delivery address with the house number in streetLine2", () => {
    expect(
      shippingAddressInput(
        {
          street: "Fő u.",
          houseNumber: "1.",
          postalCode: "3894",
          city: "Telkibánya",
          country: "HU",
        },
        { fullName: "Kovács Anna", phoneNumber: "+3630" },
        ""
      )
    ).toEqual({
      fullName: "Kovács Anna",
      phoneNumber: "+3630",
      company: "",
      streetLine1: "Fő u.",
      streetLine2: "1.",
      postalCode: "3894",
      city: "Telkibánya",
      countryCode: "HU",
    });
  });
});
