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

const noAddress = { street: "", houseNumber: "", postalCode: "", city: "" };

describe("checkoutRefusal", () => {
  it("accepts a complete order", () => {
    expect(checkoutRefusal(complete)).toBeUndefined();
  });

  it("needs no address for a method that does not require one", () => {
    expect(
      checkoutRefusal({ ...complete, shippingMethodRequiresAddress: false, address: noAddress })
    ).toBeUndefined();
  });

  it("names every missing part", () => {
    const refusal = checkoutRefusal({
      lineCount: 0,
      hasCustomer: false,
      hasShippingMethod: false,
      termsAccepted: false,
      shippingMethodRequiresAddress: false,
      address: noAddress,
    });

    expect(refusal).toEqual({
      code: "CHECKOUT_INCOMPLETE",
      missing: ["LINE", "CUSTOMER", "SHIPPING_METHOD", "TERMS"],
      addressParts: [],
    });
  });

  it("names every missing address part of a method that needs one", () => {
    expect(checkoutRefusal({ ...complete, address: noAddress })).toEqual({
      code: "CHECKOUT_INCOMPLETE",
      missing: [],
      addressParts: ["STREET", "HOUSE_NUMBER", "POSTAL_CODE", "CITY"],
    });
  });

  it("names only the address parts that are missing", () => {
    expect(
      checkoutRefusal({ ...complete, address: { ...complete.address, houseNumber: " " } })
    ).toEqual({ code: "CHECKOUT_INCOMPLETE", missing: [], addressParts: ["HOUSE_NUMBER"] });
  });
});
