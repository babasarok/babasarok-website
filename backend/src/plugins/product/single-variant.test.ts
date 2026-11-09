import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { plannedVariant, variantDrift } from "./single-variant";

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
  ],
});

const planned = plannedVariant(definition, { hu: "Párna", en: "Pillow" });

describe("plannedVariant", () => {
  it("plans one variant: the definition id, the product's names and the base price", () => {
    expect(planned).toEqual({ sku: "parna", name: { hu: "Párna", en: "Pillow" }, price: 9000 });
  });
});

describe("variantDrift", () => {
  it("reports nothing for the planned variant, whatever the key order of its names", () => {
    expect(variantDrift(planned, [{ ...planned, name: { en: "Pillow", hu: "Párna" } }])).toEqual(
      []
    );
  });

  it("reports a missing variant and surplus variants", () => {
    expect(variantDrift(planned, [])).toEqual([
      { kind: "presence", label: "A termék változata hiányzik" },
    ]);
    expect(variantDrift(planned, [planned, planned])).toEqual([
      { kind: "presence", label: "2 változat van egy helyett" },
    ]);
  });

  it("reports a changed SKU, name and price", () => {
    expect(
      variantDrift(planned, [{ sku: "regi", name: { hu: "Régi" }, price: 1 }]).map(
        (drift) => drift.kind
      )
    ).toEqual(["sku", "rename", "price"]);
  });
});
