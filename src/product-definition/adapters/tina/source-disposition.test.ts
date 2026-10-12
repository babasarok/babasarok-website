import { describe, expect, it } from "vitest";
import {
  MATERIAL_REFERENCE_SOURCE_FIELDS,
  PRODUCT_BANNED_COMBINATION_MEMBER_SOURCE_FIELDS,
  PRODUCT_BANNED_COMBINATION_SOURCE_FIELDS,
  PRODUCT_LENGTH_PRICING_SOURCE_FIELDS,
  PRODUCT_MATERIALS_SOURCE_FIELDS,
  PRODUCT_REFERENCE_SOURCE_FIELDS,
} from "./source-disposition";

describe("supporting Product source dispositions", () => {
  it("classifies length-pricing source metadata", () => {
    expect(PRODUCT_LENGTH_PRICING_SOURCE_FIELDS).toEqual({
      __typename: "transport",
      sourceField: "canonical",
    });
  });

  it("classifies forbidden Material combinations", () => {
    expect(PRODUCT_MATERIALS_SOURCE_FIELDS).toEqual({
      __typename: "transport",
      banned_combinations: "canonical",
    });
    expect(PRODUCT_BANNED_COMBINATION_SOURCE_FIELDS).toEqual({
      __typename: "transport",
      materials: "canonical",
    });
    expect(PRODUCT_BANNED_COMBINATION_MEMBER_SOURCE_FIELDS).toEqual({
      __typename: "transport",
      material_path: "canonical",
    });
  });

  it("uses only stable IDs from expanded references", () => {
    expect(MATERIAL_REFERENCE_SOURCE_FIELDS.material_id).toBe("canonical");
    expect(MATERIAL_REFERENCE_SOURCE_FIELDS.label).toBe("ignored");
    expect(PRODUCT_REFERENCE_SOURCE_FIELDS.product_id).toBe("canonical");
    expect(PRODUCT_REFERENCE_SOURCE_FIELDS.title).toBe("ignored");
    expect(PRODUCT_REFERENCE_SOURCE_FIELDS.fields).toBe("ignored");
  });
});
