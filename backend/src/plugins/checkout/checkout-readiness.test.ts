import { describe, expect, it } from "vitest";
import { checkoutRefusal, type CheckoutFacts } from "./checkout-readiness";

const complete: CheckoutFacts = {
  lineCount: 1,
  hasCustomer: true,
  hasShippingMethod: true,
  termsAccepted: true,
  shippingMethodRequiresAddress: true,
  address: { street: "Rózsa utca", houseNumber: "12", postalCode: "3900", city: "Szerencs" },
};

describe("checkoutRefusal", () => {
  it("accepts a complete order", () => {
    expect(checkoutRefusal(complete, "hu")).toBeUndefined();
  });

  it("needs no address for a method that does not require one", () => {
    expect(
      checkoutRefusal(
        {
          ...complete,
          shippingMethodRequiresAddress: false,
          address: { street: "", houseNumber: "", postalCode: "", city: "" },
        },
        "hu"
      )
    ).toBeUndefined();
  });

  it("names every missing part in Hungarian", () => {
    const refusal = checkoutRefusal(
      {
        lineCount: 0,
        hasCustomer: false,
        hasShippingMethod: false,
        termsAccepted: false,
        shippingMethodRequiresAddress: false,
        address: { street: "", houseNumber: "", postalCode: "", city: "" },
      },
      "hu"
    );

    expect(refusal).toBe(
      "A rendelés nem adható le, hiányzik: legalább egy termék, a vevő adatai, a szállítási mód, az ÁSZF elfogadása."
    );
  });

  it("names every missing address part of a method that needs one", () => {
    const refusal = checkoutRefusal(
      {
        ...complete,
        address: { street: "", houseNumber: "", postalCode: "", city: "" },
      },
      "hu"
    );

    expect(refusal).toBe(
      "A rendelés nem adható le, hiányzik: a szállítási cím (utca, házszám, irányítószám, város)."
    );
  });

  it("names only the address parts that are missing", () => {
    const refusal = checkoutRefusal(
      { ...complete, address: { ...complete.address, houseNumber: " " } },
      "hu"
    );

    expect(refusal).toBe("A rendelés nem adható le, hiányzik: a szállítási cím (házszám).");
  });

  it("refuses in the request language", () => {
    const refusal = checkoutRefusal(
      {
        lineCount: 0,
        hasCustomer: false,
        hasShippingMethod: false,
        termsAccepted: false,
        shippingMethodRequiresAddress: false,
        address: { street: "", houseNumber: "", postalCode: "", city: "" },
      },
      "en"
    );

    expect(refusal).toBe(
      "The order cannot be submitted, missing: at least one product, the customer details, the delivery method, the acceptance of the terms."
    );
  });

  it("names missing address parts in the request language", () => {
    const refusal = checkoutRefusal(
      { ...complete, address: { ...complete.address, postalCode: "" } },
      "en"
    );

    expect(refusal).toBe("The order cannot be submitted, missing: the delivery address (postcode).");
  });
});
