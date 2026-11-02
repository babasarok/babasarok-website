import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema, type ProductDefinition } from "@babasarok/product-definition";
import type { z } from "zod";
import { materialInUseError } from "./material.service";

function definition(
  id: string,
  overrides: Partial<z.input<typeof ProductDefinitionSchema>> = {}
): ProductDefinition {
  return ProductDefinitionSchema.parse({
    id,
    type: "parna",
    orderable: true,
    basePrice: 1000,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
    ...overrides,
  });
}

function materialField(
  ...materialIds: string[]
): z.input<typeof ProductDefinitionSchema>["fields"][number] {
  return {
    kind: "material",
    id: "anyag",
    label: "Anyag",
    options: materialIds.map((materialId) => ({ materialId, price: 0 })),
    colorCount: { kind: "fixed", count: 1 },
  };
}

describe("materialInUseError", () => {
  it("refuses deletion with the MATERIAL_IN_USE code and the referencing definition id", () => {
    const error = materialInUseError("pamut", [
      definition("parna", { fields: [materialField("pamut")] }),
      definition("zsak"),
    ]);

    expect(error?.extensions.code).toBe("MATERIAL_IN_USE");
    expect(error?.message).toContain("parna");
    expect(error?.message).not.toContain("zsak");
  });

  it("allows deletion when nothing references the material", () => {
    const error = materialInUseError("pamut", [
      definition("zsak", { fields: [materialField("velur")] }),
    ]);

    expect(error).toBeNull();
  });

  it("refuses when two definitions reference the material, listing both ids", () => {
    const error = materialInUseError("pamut", [
      definition("parna", { fields: [materialField("pamut")] }),
      definition("racsvedo", {
        fields: [materialField("velur")],
        forbiddenMaterialCombinations: [["velur", "pamut"]],
      }),
    ]);

    expect(error?.extensions.code).toBe("MATERIAL_IN_USE");
    expect(error?.message).toContain("parna");
    expect(error?.message).toContain("racsvedo");
  });
});
