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
    expect(checkoutRefusal(complete)).toBeUndefined();
  });

  it("needs no address for a method that does not require one", () => {
    expect(
      checkoutRefusal({ ...complete, shippingMethodRequiresAddress: false, hasAddress: false })
    ).toBeUndefined();
  });

  it("names every missing part", () => {
    const refusal = checkoutRefusal({
      lineCount: 0,
      hasCustomer: false,
      hasShippingMethod: false,
      termsAccepted: false,
      shippingMethodRequiresAddress: false,
      hasAddress: false,
    });

    expect(refusal).toBe(
      "A rendelés nem adható le, hiányzik: legalább egy termék, a vevő adatai, a szállítási mód, az ÁSZF elfogadása."
    );
  });

  it("requires the address of a method that needs one", () => {
    expect(checkoutRefusal({ ...complete, hasAddress: false })).toContain("a szállítási cím");
  });
});
