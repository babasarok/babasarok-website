import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { billingRows, contactRows, shippingRows, summaryLine, type T } from "./summaryText";
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

const charged = { listPrice: 2500, charged: 2500 };

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

const addressValue = "Fő u. 12, 3894 Telkibánya, checkout.countryHU";

describe("contactRows", () => {
  it("labels the name, email and phone, skipping missing parts", () => {
    expect(
      contactRows({ lastName: "Teszt", firstName: "Elek", email: "a@b.hu", phone: "+3630" }, t)
    ).toEqual([
      { label: "checkout.detail.name", value: "Teszt Elek" },
      { label: "checkout.detail.email", value: "a@b.hu" },
      { label: "checkout.detail.phone", value: "+3630" },
    ]);
    expect(contactRows({ lastName: "Teszt", firstName: "", email: "", phone: "" }, t)).toEqual([
      { label: "checkout.detail.name", value: "Teszt" },
    ]);
  });
});

describe("shippingRows", () => {
  it("is empty when no method is chosen", () => {
    expect(shippingRows(undefined, address, charged, "HUF", t)).toEqual([]);
  });

  it("lists the method, what the order charges and the delivery address", () => {
    expect(shippingRows(gls, address, charged, "HUF", t)).toEqual([
      { label: "checkout.detail.method", value: "GLS" },
      { label: "checkout.detail.fee", value: formatMoney(2500, "HUF") },
      { label: "checkout.detail.address", value: addressValue },
    ]);
  });

  it("says free when a promotion zeroed a charged delivery", () => {
    expect(shippingRows(gls, address, { listPrice: 2500, charged: 0 }, "HUF", t)[1]).toEqual({
      label: "checkout.detail.fee",
      value: "checkout.free",
    });
  });

  it("omits the address for a method that needs none", () => {
    expect(shippingRows(pickup, address, { listPrice: 0, charged: 0 }, "HUF", t)).toEqual([
      { label: "checkout.detail.method", value: "Személyes átvétel" },
      { label: "checkout.detail.fee", value: formatMoney(0, "HUF") },
    ]);
  });
});

describe("billingRows", () => {
  it("says same-as-shipping when ticked for an address method", () => {
    expect(billingRows(ticked, gls, t)).toEqual([
      { label: "checkout.detail.address", value: "checkout.sameAsShipping" },
    ]);
  });

  it("labels the company and tax number", () => {
    expect(billingRows({ ...ticked, company: "Minta Kft.", taxNumber: "123" }, gls, t)).toEqual([
      { label: "checkout.detail.address", value: "checkout.sameAsShipping" },
      { label: "checkout.company", value: "Minta Kft." },
      { label: "checkout.taxNumber", value: "123" },
    ]);
  });

  it("lists the own billing name and address when split, and always for pickup", () => {
    const own = [
      { label: "checkout.detail.name", value: "Teszt Elek" },
      { label: "checkout.detail.address", value: addressValue },
    ];

    expect(
      billingRows({ ...ticked, sameAsShipping: false, fullName: "Teszt Elek", address }, gls, t)
    ).toEqual(own);
    expect(billingRows({ ...ticked, fullName: "Teszt Elek", address }, pickup, t)).toEqual(own);
  });

  it("says no billing when the own fields are empty", () => {
    expect(billingRows(ticked, pickup, t)).toEqual([
      { label: "checkout.detail.address", value: "checkout.noBilling" },
    ]);
  });
});

describe("summaryLine", () => {
  it("joins a step's values into the collapsed one-liner", () => {
    expect(
      summaryLine([
        { label: "a", value: "Teszt Elek" },
        { label: "b", value: "a@b.hu" },
      ])
    ).toBe("Teszt Elek · a@b.hu");
  });
});
