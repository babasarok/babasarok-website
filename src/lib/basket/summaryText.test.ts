import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { billingSummary, contactSummary, shippingSummary, type T } from "./summaryText";
import type { AddressValues, BillingValues } from "./checkoutValues";
import type { ShippingQuote } from "./schemas";

const t: T = (key: string) => key;

const pickup: ShippingQuote = {
  id: "7",
  name: "Személyes átvétel",
  description: "",
  priceWithTax: 0,
  customFields: { requiresAddress: false },
};

const gls: ShippingQuote = {
  ...pickup,
  id: "8",
  name: "GLS",
  priceWithTax: 2500,
  customFields: { requiresAddress: true },
};

const address: AddressValues = {
  street: "Fő u.",
  houseNumber: "12",
  postalCode: "3894",
  city: "Telkibánya",
  country: "HU",
};

const empty: AddressValues = { street: "", houseNumber: "", postalCode: "", city: "", country: "HU" };

const ticked: BillingValues = {
  sameAsShipping: true,
  fullName: "",
  address: empty,
  company: "",
  taxNumber: "",
};

describe("contactSummary", () => {
  it("joins the name, email and phone with dots", () => {
    expect(
      contactSummary({
        lastName: "Teszt",
        firstName: "Elek",
        email: "a@b.hu",
        phone: "+36301234567",
      })
    ).toBe("Teszt Elek · a@b.hu · +36301234567");
  });

  it("skips missing parts", () => {
    expect(contactSummary({ lastName: "Teszt", firstName: "", email: "a@b.hu", phone: "" })).toBe(
      "Teszt · a@b.hu"
    );
    expect(contactSummary({ lastName: "", firstName: "", email: "", phone: "" })).toBe("");
  });
});

describe("shippingSummary", () => {
  it("is empty when no method is chosen", () => {
    expect(shippingSummary(undefined, address, "HUF", t)).toBe("");
  });

  it("shows the method, its price and the delivery address", () => {
    expect(shippingSummary(gls, address, "HUF", t)).toBe(
      `GLS · ${formatMoney(2500, "HUF")} · Fő u. 12, 3894 Telkibánya, checkout.countryHU`
    );
  });

  it("omits the address for a method that needs none", () => {
    expect(shippingSummary(pickup, address, "HUF", t)).toBe(
      `Személyes átvétel · ${formatMoney(0, "HUF")}`
    );
  });
});

describe("billingSummary", () => {
  it("says same-as-shipping when ticked for an address method", () => {
    expect(billingSummary(ticked, gls, t)).toBe("checkout.sameAsShipping");
  });

  it("appends the company and tax number", () => {
    expect(billingSummary({ ...ticked, company: "Minta Kft.", taxNumber: "123" }, gls, t)).toBe(
      "checkout.sameAsShipping · Minta Kft. · 123"
    );
  });

  it("shows the own billing address when split", () => {
    expect(
      billingSummary({ ...ticked, sameAsShipping: false, fullName: "Teszt Elek", address }, gls, t)
    ).toBe("Teszt Elek · Fő u. 12, 3894 Telkibánya, checkout.countryHU");
  });

  it("always shows the own billing address for pickup", () => {
    expect(billingSummary({ ...ticked, fullName: "Teszt Elek", address }, pickup, t)).toBe(
      "Teszt Elek · Fő u. 12, 3894 Telkibánya, checkout.countryHU"
    );
  });

  it("says no billing when the own fields are empty", () => {
    expect(billingSummary(ticked, pickup, t)).toBe("checkout.noBilling");
  });
});
