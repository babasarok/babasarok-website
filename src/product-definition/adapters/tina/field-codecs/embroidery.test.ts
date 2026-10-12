import { describe, expect, it } from "vitest";

import { compileField } from "./registry";
import { createFieldSource } from "./test-fixtures";

const fieldSource = createFieldSource({ name: "himes", label: "Hímzés", type: "embroidery" });

describe("embroidery field", () => {
  it("compiles flat pricing with placeholder and pattern", () => {
    expect(
      compileField(
        fieldSource({ price: 300, price_unit: "flat", placeholder: " Szöveg ", regex: "^[a-z]+$" })
      )
    ).toEqual({
      success: true,
      value: {
        id: "himes",
        label: "Hímzés",
        kind: "embroidery",
        visibility: { kind: "always" },
        pricing: { kind: "flat", price: 300 },
        placeholder: "Szöveg",
        pattern: "^[a-z]+$",
      },
    });
  });

  it("compiles per-word pricing", () => {
    expect(compileField(fieldSource({ price: 12, price_unit: "word" }))).toEqual({
      success: true,
      value: {
        id: "himes",
        label: "Hímzés",
        kind: "embroidery",
        visibility: { kind: "always" },
        pricing: { kind: "per-word", pricePerWord: 12 },
      },
    });
  });

  it("falls back to flat pricing without a price unit", () => {
    expect(compileField(fieldSource())).toEqual({
      success: true,
      value: {
        id: "himes",
        label: "Hímzés",
        kind: "embroidery",
        visibility: { kind: "always" },
        pricing: { kind: "flat", price: 0 },
      },
    });
  });

  it("fails with a canonical issue on negative money", () => {
    const result = compileField(fieldSource({ price: -1 }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "himes",
          path: ["pricing", "price"],
        }),
      ])
    );
  });

  it("fails with a canonical issue on an invalid pattern", () => {
    const result = compileField(fieldSource({ regex: "(" }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "himes",
          path: ["pattern"],
          message: "Must be a valid regular expression",
        }),
      ])
    );
  });
});
