import { describe, expect, it } from "vitest";
import { checkoutRefusal, type CheckoutFacts } from "./checkout-readiness";

const complete: CheckoutFacts = {
  lineCount: 1,
  hasCustomer: true,
  hasShippingMethod: true,
  termsAccepted: true,
  shippingMethodRequiresAddress: true,
  hasAddress: true,
};

describe("checkoutRefusal", () => {
  it("accepts a complete order", () => {
    expect(checkoutRefusal(complete, "hu")).toBeUndefined();
  });

  it("needs no address for a method that does not require one", () => {
    expect(
      checkoutRefusal(
        { ...complete, shippingMethodRequiresAddress: false, hasAddress: false },
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
        hasAddress: false,
      },
      "hu"
    );

    expect(refusal).toBe(
      "A rendelés nem adható le, hiányzik: legalább egy termék, a vevő adatai, a szállítási mód, az ÁSZF elfogadása."
    );
  });

  it("requires the address of a method that needs one", () => {
    expect(checkoutRefusal({ ...complete, hasAddress: false }, "hu")).toContain("a szállítási cím");
  });

  it("refuses in the request language", () => {
    const refusal = checkoutRefusal(
      {
        lineCount: 0,
        hasCustomer: false,
        hasShippingMethod: false,
        termsAccepted: false,
        shippingMethodRequiresAddress: false,
        hasAddress: false,
      },
      "en"
    );

    expect(refusal).toBe(
      "The order cannot be submitted, missing: at least one product, the customer details, the delivery method, the acceptance of the terms."
    );
  });
});
