import { describe, expect, it } from "vitest";

import { compileField } from "./registry";
import { createFieldSource, fieldItem } from "./test-fixtures";

const fieldSource = createFieldSource({ name: "szin", label: "Szín", type: "select" });

describe("choice field", () => {
  it("compiles select options with the field-level price", () => {
    expect(
      compileField(
        fieldSource({
          price: 4500,
          items: [fieldItem(" piros", { label: "Piros", tooltip: " t " })],
        })
      )
    ).toEqual({
      success: true,
      value: {
        id: "szin",
        label: "Szín",
        kind: "choice",
        presentation: "select",
        price: 4500,
        visibility: { kind: "always" },
        options: [{ id: "piros", label: "Piros", price: 0, tooltip: "t" }],
      },
    });
  });

  it("preserves the radio and color presentations", () => {
    expect(compileField(fieldSource({ type: "radio", items: [fieldItem("x")] }))).toEqual({
      success: true,
      value: {
        id: "szin",
        label: "Szín",
        kind: "choice",
        presentation: "radio",
        price: 0,
        visibility: { kind: "always" },
        options: [{ id: "x", label: "x", price: 0 }],
      },
    });
    expect(compileField(fieldSource({ type: "color", items: [fieldItem("x")] }))).toEqual({
      success: true,
      value: {
        id: "szin",
        label: "Szín",
        kind: "choice",
        presentation: "color",
        price: 0,
        visibility: { kind: "always" },
        options: [{ id: "x", label: "x", price: 0 }],
      },
    });
  });

  it("nests regex and placeholder in customValue only when allowed", () => {
    expect(
      compileField(
        fieldSource({
          allow_custom_value: true,
          regex: "^[a-z]+$",
          placeholder: " Szabad szöveg ",
          price: 1500,
          items: [fieldItem("x")],
        })
      )
    ).toEqual({
      success: true,
      value: {
        id: "szin",
        label: "Szín",
        kind: "choice",
        presentation: "select",
        price: 1500,
        visibility: { kind: "always" },
        options: [{ id: "x", label: "x", price: 0 }],
        customValue: { pattern: "^[a-z]+$", placeholder: "Szabad szöveg" },
      },
    });
    expect(
      compileField(
        fieldSource({
          allow_custom_value: false,
          regex: "^[a-z]+$",
          placeholder: "x",
          items: [fieldItem("y")],
        })
      )
    ).toEqual({
      success: true,
      value: {
        id: "szin",
        label: "Szín",
        kind: "choice",
        presentation: "select",
        price: 0,
        visibility: { kind: "always" },
        options: [{ id: "y", label: "y", price: 0 }],
      },
    });
  });

  it("accumulates null items with their path", () => {
    const result = compileField(fieldSource({ items: [fieldItem("x"), null] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.null-item",
          fieldId: "szin",
          path: ["items", 1],
        }),
      ])
    );
  });

  it("fails with a canonical issue when no option remains", () => {
    const result = compileField(fieldSource({ items: [] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "szin",
          path: ["options"],
        }),
      ])
    );
  });

  it("fails with canonical issues on an empty option id and label", () => {
    const result = compileField(fieldSource({ items: [fieldItem("   ")] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(2);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "szin",
          path: ["options", 0, "id"],
        }),
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "szin",
          path: ["options", 0, "label"],
        }),
      ])
    );
  });

  it("fails with a canonical issue on fractional option money", () => {
    const result = compileField(fieldSource({ items: [fieldItem("x", { price: 1.5 })] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "szin",
          path: ["options", 0, "price"],
        }),
      ])
    );
  });

  it("fails with a canonical issue on an invalid custom pattern", () => {
    const result = compileField(
      fieldSource({ allow_custom_value: true, regex: "(", items: [fieldItem("x")] })
    );
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "szin",
          path: ["customValue", "pattern"],
          message: "Must be a valid regular expression",
        }),
      ])
    );
  });
});
