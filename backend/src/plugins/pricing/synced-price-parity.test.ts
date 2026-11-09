import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { computeLineUnitPrice, isAxisField, type LineSelections } from "../../shared/pricing/index";
import { planVariantCombinations } from "../product/variant-plan";

const definition = ProductDefinitionSchema.parse({
  id: "babafeszek",
  basePrice: 20_000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [["wellsoft", "wellsoft"]],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "select",
      visibility: { kind: "always" },
      options: [
        { id: "kicsi", label: { hu: "Kicsi" }, price: 0 },
        { id: "nagy", label: { hu: "Nagy" }, price: 4000 },
      ],
    },
    {
      kind: "toggle",
      id: "gumi",
      label: { hu: "Gumi" },
      visibility: { kind: "always" },
      price: 800,
    },
    {
      kind: "toggle",
      id: "masni",
      label: { hu: "Masni" },
      visibility: { kind: "when-equal", fieldId: "gumi", value: true },
      price: 500,
    },
    {
      kind: "input",
      id: "felirat",
      label: { hu: "Felirat" },
      visibility: { kind: "always" },
      required: false,
      price: 0,
    },
    {
      kind: "toggle",
      id: "dupla",
      label: { hu: "Dupla felirat" },
      visibility: { kind: "when-present", fieldId: "felirat" },
      price: 700,
    },
    {
      kind: "material",
      id: "kulso",
      label: { hu: "Külső" },
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "wellsoft", price: 3000 },
        { materialId: "minky", price: 1000 },
      ],
    },
    {
      kind: "material",
      id: "belso",
      label: { hu: "Belső" },
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "wellsoft", price: 2000 },
        { materialId: "pamut", price: 0 },
      ],
    },
  ],
});

function selectionsFor(optionCodes: readonly string[]): LineSelections {
  const selections: LineSelections = {};

  for (const [index, field] of definition.fields.filter(isAxisField).entries()) {
    const code = optionCodes[index];

    if (field.kind === "material") {
      selections[field.id] = { kind: "material", materialId: code, colors: [] };
      continue;
    }

    selections[field.id] = { kind: "option", value: code };
  }

  return selections;
}

describe("definition pricing vs the synced variant matrix", () => {
  it("prices every generated combination at its variant's synced price, extras aside", () => {
    const { variants } = planVariantCombinations(definition, new Map(), { hu: "Babafészek" });

    expect(variants.length).toBeGreaterThan(0);

    for (const variant of variants) {
      const price = computeLineUnitPrice({
        definition,
        productName: "Babafészek",
        selections: {
          ...selectionsFor(variant.optionCodes),
          felirat: { kind: "input", value: "Ana" },
        },
        lengthCm: null,
        languageCode: "hu",
      });

      expect({ sku: variant.sku, price }).toEqual({ sku: variant.sku, price: variant.price });
    }
  });
});
