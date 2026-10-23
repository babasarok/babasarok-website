import { describe, expect, it } from "vitest";

import { compileField } from "./registry";
import { createFieldSource } from "./test-fixtures";

const fieldSource = createFieldSource({ name: "hatar", label: "Határolt", type: "toggle" });

describe("toggle field", () => {
  it("compiles price with always visibility", () => {
    expect(compileField(fieldSource({ price: 1200 }))).toEqual({
      success: true,
      value: {
        id: "hatar",
        label: "Határolt",
        kind: "toggle",
        visibility: { kind: "always" },
        price: 1200,
      },
    });
  });

  it("compiles a when-present visibility rule", () => {
    expect(
      compileField(
        fieldSource({
          depends_on: { __typename: "ProductFieldsDepends_on", field: "alt", value: null },
        })
      )
    ).toEqual({
      success: true,
      value: {
        id: "hatar",
        label: "Határolt",
        kind: "toggle",
        visibility: { kind: "when-present", fieldId: "alt" },
        price: 0,
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
          fieldId: "hatar",
          path: ["price"],
        }),
      ])
    );
  });
});
