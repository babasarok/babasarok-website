import { describe, expect, it } from "vitest";

import { compileField } from "./registry";
import { createFieldSource, fieldItem } from "./test-fixtures";

const fieldSource = createFieldSource({ name: "meret", label: "Méret", type: "input" });

describe("input field", () => {
  it("compiles the base input field", () => {
    expect(compileField(fieldSource())).toEqual({
      success: true,
      value: {
        id: "meret",
        label: "Méret",
        kind: "input",
        visibility: { kind: "always" },
        required: true,
        price: 0,
      },
    });
  });

  it("trims id, label and optional text into canonical fields", () => {
    expect(
      compileField(
        fieldSource({
          name: " méret ",
          label: "  Méret  ",
          tooltip: " tipp ",
          placeholder: " pl. ",
        })
      )
    ).toEqual({
      success: true,
      value: {
        id: "méret",
        label: "Méret",
        tooltip: "tipp",
        placeholder: "pl.",
        kind: "input",
        visibility: { kind: "always" },
        required: true,
        price: 0,
      },
    });
  });

  it("maps optional flag and money", () => {
    expect(compileField(fieldSource({ optional: true, price: 2500 }))).toEqual({
      success: true,
      value: {
        id: "meret",
        label: "Méret",
        kind: "input",
        visibility: { kind: "always" },
        required: false,
        price: 2500,
      },
    });
  });

  it("maps non-null items to suggestions and ignores item price and tooltip", () => {
    expect(
      compileField(
        fieldSource({
          items: [fieldItem(" m ", { label: " M ", price: 999, tooltip: "x" }), fieldItem("xl")],
        })
      )
    ).toEqual({
      success: true,
      value: {
        id: "meret",
        label: "Méret",
        kind: "input",
        visibility: { kind: "always" },
        required: true,
        price: 0,
        suggestions: [
          { value: "m", label: "M" },
          { value: "xl", label: "xl" },
        ],
      },
    });
  });

  it("omits an empty suggestions list", () => {
    expect(compileField(fieldSource({ items: [] }))).toEqual({
      success: true,
      value: {
        id: "meret",
        label: "Méret",
        kind: "input",
        visibility: { kind: "always" },
        required: true,
        price: 0,
      },
    });
  });

  it("accumulates null items with their path", () => {
    const result = compileField(fieldSource({ items: [fieldItem("m"), null] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.null-item",
          fieldId: "meret",
          path: ["items", 1],
        }),
      ])
    );
  });

  it("fails with a canonical issue on negative money", () => {
    const result = compileField(fieldSource({ price: -5 }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "meret",
          path: ["price"],
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
          fieldId: "meret",
          path: ["pattern"],
          message: "Must be a valid regular expression",
        }),
      ])
    );
  });

  it("fails with a canonical issue on an empty id", () => {
    const result = compileField(fieldSource({ name: "   " }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "",
          path: ["id"],
        }),
      ])
    );
  });
});
