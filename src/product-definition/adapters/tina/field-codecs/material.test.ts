import { describe, expect, it } from "vitest";

import { compileField } from "./registry";
import { createFieldSource, materialOption } from "./test-fixtures";

const fieldSource = createFieldSource({ name: "anyag", label: "Anyag", type: "material" });

describe("material field", () => {
  it("compiles a fixed color count and material options", () => {
    expect(
      compileField(fieldSource({ color_count: "2", materials: [materialOption(" anyag-1 ", 100)] }))
    ).toEqual({
      success: true,
      value: {
        id: "anyag",
        label: "Anyag",
        kind: "material",
        options: [{ materialId: "anyag-1", price: 100 }],
        colorCount: { kind: "fixed", count: 2 },
      },
    });
  });

  it("maps a non-integer color count to a from-field rule", () => {
    expect(
      compileField(
        fieldSource({ color_count: " meret ", materials: [materialOption("anyag-1", 0)] })
      )
    ).toEqual({
      success: true,
      value: {
        id: "anyag",
        label: "Anyag",
        kind: "material",
        options: [{ materialId: "anyag-1", price: 0 }],
        colorCount: { kind: "from-field", fieldId: "meret" },
      },
    });
  });

  it("defaults an absent or blank color count to fixed 1", () => {
    const base = {
      id: "anyag",
      label: "Anyag",
      kind: "material",
      options: [{ materialId: "a", price: 0 }],
    };
    expect(compileField(fieldSource({ materials: [materialOption("a", 0)] }))).toEqual({
      success: true,
      value: { ...base, colorCount: { kind: "fixed", count: 1 } },
    });
    expect(
      compileField(fieldSource({ color_count: "   ", materials: [materialOption("a", 0)] }))
    ).toEqual({
      success: true,
      value: { ...base, colorCount: { kind: "fixed", count: 1 } },
    });
  });

  it.each(["0", "1.5", "-1"])("rejects invalid fixed color count %s", (color_count) => {
    const result = compileField(fieldSource({ color_count, materials: [materialOption("a", 0)] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "anyag",
          path: ["colorCount", "count"],
        }),
      ])
    );
  });

  it("accumulates null material members with their path", () => {
    const result = compileField(fieldSource({ materials: [materialOption("a", 1), null] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.null-material",
          fieldId: "anyag",
          path: ["materials", 1],
        }),
      ])
    );
  });

  it("fails with a canonical issue when no material remains", () => {
    const result = compileField(fieldSource());
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "anyag",
          path: ["options"],
        }),
      ])
    );
  });

  it("fails with a canonical issue on an empty material id", () => {
    const result = compileField(fieldSource({ materials: [materialOption("   ", 1)] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "anyag",
          path: ["options", 0, "materialId"],
        }),
      ])
    );
  });

  it("fails with a canonical issue on negative material money", () => {
    const result = compileField(fieldSource({ materials: [materialOption("a", -3)] }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "field.definition-invalid",
          fieldId: "anyag",
          path: ["options", 0, "price"],
        }),
      ])
    );
  });
});
