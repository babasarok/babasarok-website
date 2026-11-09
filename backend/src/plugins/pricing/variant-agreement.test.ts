import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { variantDisagreement } from "./variant-agreement";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "40", label: { hu: "40x40" }, price: 0 },
        { id: "50", label: { hu: "50x50" }, price: 2000 },
      ],
    },
    {
      kind: "material",
      id: "anyag",
      label: { hu: "Anyag" },
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "wellsoft", price: 3000 },
        { materialId: "minky", price: 0 },
      ],
    },
  ],
});

const variant = new Map([
  ["meret", "40"],
  ["anyag", "minky"],
]);

describe("variantDisagreement", () => {
  it("accepts a variant matching the selections", () => {
    expect(
      variantDisagreement(
        definition,
        {
          meret: { kind: "option", value: "40" },
          anyag: { kind: "material", materialId: "minky", colors: [] },
        },
        variant,
        "hu"
      )
    ).toBeUndefined();
  });

  it("refuses a material or a listed choice the variant does not carry", () => {
    expect(
      variantDisagreement(
        definition,
        { anyag: { kind: "material", materialId: "wellsoft", colors: [] } },
        variant,
        "hu"
      )
    ).toMatch(/anyagválasztása nem egyezik/);
    expect(
      variantDisagreement(definition, { meret: { kind: "option", value: "50" } }, variant, "hu")
    ).toMatch(/Méret.*nem egyezik/);
  });

  it("refuses a variant missing an axis option", () => {
    expect(variantDisagreement(definition, {}, new Map([["meret", "40"]]), "hu")).toMatch(
      /"anyag" választása nincs rajta/
    );
  });
});
