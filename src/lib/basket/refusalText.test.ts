import { describe, expect, it } from "vitest";
import { createI18n } from "@/lib/i18next";
import { reasonText, refusalText } from "./refusalText";

const hu = createI18n("hu");
const en = createI18n("en");

describe("refusalText", () => {
  it("words a refusal in the page's language", () => {
    const refusal = { code: "VARIANT_UNAVAILABLE", productName: "Párna" } as const;

    expect(refusalText(hu, refusal)).toBe("A(z) Párna kiválasztott változata már nem elérhető.");
    expect(refusalText(en, refusal)).toBe("The selected variant of Párna is no longer available.");
  });

  it("words the nested selection reason", () => {
    expect(
      refusalText(en, {
        code: "SELECTION_INVALID",
        productName: "Párna",
        fieldLabel: "Name",
        reason: { code: "TEXT_TOO_LONG", subject: "text", maxLength: 200 },
      })
    ).toBe(
      'The "Name" field of "Párna" has an invalid choice: the text can be at most 200 characters.'
    );
  });

  it("lists what checkout lacks with the address parts before the terms", () => {
    expect(
      refusalText(hu, {
        code: "CHECKOUT_INCOMPLETE",
        missing: ["SHIPPING_METHOD", "TERMS"],
        addressParts: ["STREET", "CITY"],
      })
    ).toBe(
      "A rendelés nem adható le, hiányzik: a szállítási mód, a szállítási cím (utca, város), az ÁSZF elfogadása."
    );
  });
});

describe("reasonText", () => {
  it("translates i18n keys and keeps the server's own text", () => {
    expect(reasonText(en, "errors.network")).toBe("network error");
    expect(reasonText(en, "Some Vendure message")).toBe("Some Vendure message");
  });
});
