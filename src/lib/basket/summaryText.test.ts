import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { billingSummary, contactSummary, shippingSummary, type T } from "./summaryText";
import { EMPTY_ADDRESS, EMPTY_BILLING, type AddressDraft, type BillingDraft } from "./drafts";
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

const address: AddressDraft = {
  street: "Fő u.",
  houseNumber: "12",
  postalCode: "3894",
  city: "Telkibánya",
  country: "HU",
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
    expect(shippingSummary(undefined, address, t)).toBe("");
  });

  it("shows the method name and the formatted price", () => {
    expect(shippingSummary(gls, address, t)).toBe(`GLS · ${formatMoney(2500, "HUF")}`);
  });
});

describe("billingSummary", () => {
  it("refers to the shipping address when the addresses match", () => {
    const billing: BillingDraft = { ...EMPTY_BILLING, sameAsShipping: true };

    expect(billingSummary(billing, gls, t)).toBe("checkout.sameAsShipping");
  });

  it("appends the company data to the shipping-address reference", () => {
    const billing: BillingDraft = { ...EMPTY_BILLING, company: "Minta Kft.", taxNumber: "1234" };

    expect(billingSummary(billing, gls, t)).toBe("checkout.sameAsShipping · Minta Kft. · 1234");
  });

  it("renders the split billing address one-line with the country label", () => {
    const billing: BillingDraft = { ...EMPTY_BILLING, sameAsShipping: false, address };

    expect(billingSummary(billing, gls, t)).toBe("Fő u. 12, 3894 Telkibánya, checkout.countryHU");
  });

  it("renders the mandatory billing address for pickup", () => {
    const billing: BillingDraft = { ...EMPTY_BILLING, sameAsShipping: false, address };

    expect(billingSummary(billing, pickup, t)).toBe(
      "Fő u. 12, 3894 Telkibánya, checkout.countryHU"
    );
  });

  it("falls back to the no-billing text when everything is empty", () => {
    expect(billingSummary(EMPTY_BILLING, pickup, t)).toBe("checkout.noBilling");
  });

  it("shows the company alone when the billing address is empty but company data is set", () => {
    const billing: BillingDraft = { ...EMPTY_BILLING, company: "Minta Kft." };

    expect(billingSummary(billing, pickup, t)).toBe("Minta Kft.");
  });

  it("treats a missing method like an address-less flow", () => {
    expect(billingSummary({ ...EMPTY_BILLING, address }, undefined, t)).toBe(
      "Fő u. 12, 3894 Telkibánya, checkout.countryHU"
    );
    expect(billingSummary(EMPTY_BILLING, undefined, t)).toBe("checkout.noBilling");
  });

  it("keeps non-HU countries untranslated", () => {
    const billing: BillingDraft = {
      ...EMPTY_BILLING,
      sameAsShipping: false,
      address: { ...EMPTY_ADDRESS, ...address, country: "SK" },
    };

    expect(billingSummary(billing, pickup, t)).toBe("Fő u. 12, 3894 Telkibánya, SK");
  });
});
