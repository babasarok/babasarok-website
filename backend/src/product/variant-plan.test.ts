import { ProductDefinitionSchema, type ProductDefinition } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import { planVariantCombinations } from "./variant-plan";

// The specimen product's shape (src/content/product/babafeszek.md), parsed
// through the canonical schema so ids carry their brands.
const babafeszek: ProductDefinition = ProductDefinitionSchema.parse({
  id: "babafeszek",
  label: "Babafészek",
  revision: "rev-1",
  type: "babafeszek",
  orderable: true,
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: "Méret",
      presentation: "radio",
      price: 0,
      visibility: { kind: "always" },
      options: [
        { id: "35x65", label: "Normál", price: 0 },
        { id: "40x75", label: "Közepes", price: 1500 },
        { id: "50x90", label: "XXL", price: 5000 },
      ],
    },
    { kind: "toggle", id: "betet", label: "Betét", visibility: { kind: "always" }, price: 3700 },
    {
      kind: "toggle",
      id: "fodor",
      label: "Fodorral kérem",
      visibility: { kind: "always" },
      price: 4000,
    },
    {
      kind: "material",
      id: "anyag1",
      label: "Anyag 1",
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "teddy", price: 0 },
        { materialId: "wellsoft", price: 0 },
        { materialId: "waffle", price: 0 },
      ],
    },
    {
      kind: "material",
      id: "anyag2",
      label: "Anyag 2",
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "teddy", price: 0 },
        { materialId: "wellsoft", price: 0 },
        { materialId: "waffle", price: 0 },
      ],
    },
  ],
  forbiddenMaterialCombinations: [["wellsoft", "wellsoft"]],
});

const labels = new Map([
  ["teddy", "Teddy"],
  ["wellsoft", "Wellsoft"],
  ["waffle", "Waffle"],
]);

describe("planVariantCombinations", () => {
  it("generates one option group per variant-carrying field", () => {
    const plan = planVariantCombinations(babafeszek, labels);

    expect(plan.optionGroups.map((group) => group.code)).toEqual([
      "meret",
      "betet",
      "fodor",
      "anyag1",
      "anyag2",
    ]);
    expect(plan.optionGroups.find((group) => group.code === "anyag1")?.options).toEqual([
      { code: "teddy", name: "Teddy", price: 0 },
      { code: "wellsoft", name: "Wellsoft", price: 0 },
      { code: "waffle", name: "Waffle", price: 0 },
    ]);
  });

  it("enumerates the full product minus the forbidden combinations", () => {
    const plan = planVariantCombinations(babafeszek, labels);

    expect(plan.variants).toHaveLength(3 * 2 * 2 * 3 * 3 - 3 * 2 * 2);
    expect(plan.bannedOmitted).toBe(3 * 2 * 2);
    expect(
      plan.variants.filter(
        (variant) =>
          variant.optionCodes.includes("wellsoft") &&
          variant.optionCodes.filter((code) => code === "wellsoft").length === 2
      )
    ).toHaveLength(0);
  });

  it("prices a variant as base plus every chosen option's price", () => {
    const plan = planVariantCombinations(babafeszek, labels);
    const priced = plan.variants.find(
      (variant) =>
        variant.optionCodes.includes("40x75") &&
        variant.optionCodes.filter((code) => code === "igen").length === 2 &&
        variant.optionCodes.filter((code) => code === "waffle").length === 2
    );

    expect(priced?.price).toBe(15_000 + 1500 + 3700 + 4000);
    expect(priced?.sku).toBe("babafeszek--40x75-igen-igen-waffle-waffle");
  });

  it("keeps input and embroidery fields out of the variant matrix", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      id: "egyeb",
      label: "Egyéb",
      fields: [
        {
          kind: "input",
          id: "szoveg",
          label: "Szöveg",
          visibility: { kind: "always" },
          required: true,
          price: 0,
        },
        {
          kind: "embroidery",
          id: "himzes",
          label: "Hímzés",
          visibility: { kind: "always" },
          pricing: { kind: "per-word", pricePerWord: 500 },
        },
      ],
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, labels);

    expect(plan.optionGroups).toEqual([]);
    expect(plan.variants).toEqual([
      { sku: "egyeb", name: "Egyéb", price: 15_000, optionCodes: [] },
    ]);
  });

  it("leaves length-priced variants at 0 Ft — their price is length-dependent", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      id: "racsvedo",
      label: "Rácsvédő",
      basePrice: 0,
      pricing: { kind: "length", sourceFieldId: "meret" },
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, labels);

    expect(plan.variants).toHaveLength(3 * 2 * 2 * 3 * 3);
    expect(plan.variants.every((variant) => variant.price === 0)).toBe(true);
  });
});
