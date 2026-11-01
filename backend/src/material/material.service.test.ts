import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema, type ProductDefinition } from "@babasarok/product-definition";
import type { z } from "zod";
import { materialInUseError } from "./material.service";

function definition(
  label: string,
  overrides: Partial<z.input<typeof ProductDefinitionSchema>> = {}
): ProductDefinition {
  return ProductDefinitionSchema.parse({
    id: "teszt-termek",
    label,
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
  it("refuses deletion with the MATERIAL_IN_USE code and the referencing label", () => {
    const error = materialInUseError("pamut", [
      definition("Párna", { fields: [materialField("pamut")] }),
      definition("Zsák"),
    ]);

    expect(error?.extensions.code).toBe("MATERIAL_IN_USE");
    expect(error?.message).toContain("Párna");
    expect(error?.message).not.toContain("Zsák");
  });

  it("allows deletion when nothing references the material", () => {
    const error = materialInUseError("pamut", [
      definition("Zsák", { fields: [materialField("velur")] }),
    ]);

    expect(error).toBeNull();
  });

  it("refuses when two definitions reference the material, listing both labels", () => {
    const error = materialInUseError("pamut", [
      definition("Párna", { fields: [materialField("pamut")] }),
      definition("Rácsvédő", {
        fields: [materialField("velur")],
        forbiddenMaterialCombinations: [["velur", "pamut"]],
      }),
    ]);

    expect(error?.extensions.code).toBe("MATERIAL_IN_USE");
    expect(error?.message).toContain("Párna");
    expect(error?.message).toContain("Rácsvédő");
  });
});
