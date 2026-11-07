import { describe, expect, it } from "vitest";
import {
  ProductDefinitionSchema,
  type ProductDefinition,
} from "../../shared/product-definition/index";
import type { z } from "zod";
import { materialInUseError } from "./material.service";

function definition(
  id: string,
  overrides: Partial<z.input<typeof ProductDefinitionSchema>> = {}
): { name: string; definition: ProductDefinition } {
  const parsed = ProductDefinitionSchema.parse({
    id,
    basePrice: 1000,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
    ...overrides,
  });

  return { name: `Név ${id}`, definition: parsed };
}

function materialField(
  ...materialIds: string[]
): z.input<typeof ProductDefinitionSchema>["fields"][number] {
  return {
    kind: "material",
    id: "anyag",
    label: { hu: "Anyag" },
    options: materialIds.map((materialId) => ({ materialId, price: 0 })),
    colorCount: { kind: "fixed", count: 1 },
  };
}

describe("materialInUseError", () => {
  it("refuses deletion with the MATERIAL_IN_USE code and the referencing product name", () => {
    const error = materialInUseError("pamut", [
      definition("parna", { fields: [materialField("pamut")] }),
      definition("zsak"),
    ]);

    expect(error?.extensions.code).toBe("MATERIAL_IN_USE");
    expect(error?.message).toContain("Név parna");
    expect(error?.message).not.toContain("Név zsak");
  });

  it("allows deletion when nothing references the material", () => {
    const error = materialInUseError("pamut", [
      definition("zsak", { fields: [materialField("velur")] }),
    ]);

    expect(error).toBeNull();
  });

  it("refuses when two definitions reference the material, listing both names", () => {
    const error = materialInUseError("pamut", [
      definition("parna", { fields: [materialField("pamut")] }),
      definition("racsvedo", {
        fields: [materialField("velur")],
        forbiddenMaterialCombinations: [["velur", "pamut"]],
      }),
    ]);

    expect(error?.extensions.code).toBe("MATERIAL_IN_USE");
    expect(error?.message).toContain("Név parna");
    expect(error?.message).toContain("Név racsvedo");
  });
});
