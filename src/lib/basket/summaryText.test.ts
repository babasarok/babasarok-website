import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { billingLines, contactLines, shippingLines, summaryLine, type T } from "./summaryText";
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

const empty: AddressValues = {
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  country: "HU",
};

const ticked: BillingValues = {
  sameAsShipping: true,
  fullName: "",
  address: empty,
  company: "",
  taxNumber: "",
};

describe("contactLines", () => {
  it("lists the name, email and phone, skipping missing parts", () => {
    expect(
      contactLines({ lastName: "Teszt", firstName: "Elek", email: "a@b.hu", phone: "+3630" })
    ).toEqual(["Teszt Elek", "a@b.hu", "+3630"]);
    expect(contactLines({ lastName: "Teszt", firstName: "", email: "", phone: "" })).toEqual([
      "Teszt",
    ]);
  });
});

describe("shippingLines", () => {
  it("is empty when no method is chosen", () => {
    expect(shippingLines(undefined, address, "HUF", t)).toEqual([]);
  });

  it("lists the method with its price, then the delivery address line by line", () => {
    expect(shippingLines(gls, address, "HUF", t)).toEqual([
      `GLS · ${formatMoney(2500, "HUF")}`,
      "Fő u. 12",
      "3894 Telkibánya",
      "checkout.countryHU",
    ]);
  });

  it("omits the address for a method that needs none", () => {
    expect(shippingLines(pickup, address, "HUF", t)).toEqual([
      `Személyes átvétel · ${formatMoney(0, "HUF")}`,
    ]);
  });
});

describe("billingLines", () => {
  it("says same-as-shipping when ticked for an address method", () => {
    expect(billingLines(ticked, gls, t)).toEqual(["checkout.sameAsShipping"]);
  });

  it("labels the company and tax number", () => {
    expect(billingLines({ ...ticked, company: "Minta Kft.", taxNumber: "123" }, gls, t)).toEqual([
      "checkout.sameAsShipping",
      "checkout.company: Minta Kft.",
      "checkout.taxNumber: 123",
    ]);
  });

  it("lists the own billing name and address when split", () => {
    expect(
      billingLines({ ...ticked, sameAsShipping: false, fullName: "Teszt Elek", address }, gls, t)
    ).toEqual(["Teszt Elek", "Fő u. 12", "3894 Telkibánya", "checkout.countryHU"]);
  });

  it("always lists the own billing address for pickup", () => {
    expect(billingLines({ ...ticked, fullName: "Teszt Elek", address }, pickup, t)).toEqual([
      "Teszt Elek",
      "Fő u. 12",
      "3894 Telkibánya",
      "checkout.countryHU",
    ]);
  });

  it("says no billing when the own fields are empty", () => {
    expect(billingLines(ticked, pickup, t)).toEqual(["checkout.noBilling"]);
  });
});

describe("summaryLine", () => {
  it("joins a step's lines into the collapsed one-liner", () => {
    expect(summaryLine(["Teszt Elek", "a@b.hu"])).toBe("Teszt Elek · a@b.hu");
  });
});
