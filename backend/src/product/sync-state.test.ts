import { ProductDefinitionSchema, type ProductDefinition } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import { definitionHash, nativeStateHash, type NativeProductState } from "./sync-state";

const definition: ProductDefinition = ProductDefinitionSchema.parse({
  id: "babafeszek",
  label: "Babafészek",
  revision: "rev-1",
  type: "babafeszek",
  orderable: true,
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    { kind: "toggle", id: "betet", label: "Betét", visibility: { kind: "always" }, price: 3700 },
  ],
  forbiddenMaterialCombinations: [],
});

const nativeState: NativeProductState = {
  slug: "babafeszek",
  name: "Babafészek",
  optionGroups: [
    {
      code: "meret",
      name: "Méret",
      options: [
        { code: "kicsi", name: "Kicsi" },
        { code: "nagy", name: "Nagy" },
      ],
    },
  ],
  variants: [
    {
      sku: "babafeszek--kicsi",
      name: "Babafészek (Kicsi)",
      price: 15_000,
      options: [{ groupCode: "meret", optionCode: "kicsi" }],
    },
    {
      sku: "babafeszek--nagy",
      name: "Babafészek (Nagy)",
      price: 16_000,
      options: [{ groupCode: "meret", optionCode: "nagy" }],
    },
  ],
};

describe("definitionHash", () => {
  it("is stable under key order and irrelevant normalization", () => {
    const reordered = ProductDefinitionSchema.parse({
      forbiddenMaterialCombinations: [],
      fields: [
        {
          price: 3700,
          visibility: { kind: "always" },
          label: "Betét",
          id: "betet",
          kind: "toggle",
        },
      ],
      pricing: { kind: "unit" },
      basePrice: 15_000,
      orderable: true,
      type: "babafeszek",
      revision: "rev-1",
      label: "Babafészek",
      id: "babafeszek",
    });

    expect(definitionHash(ProductDefinitionSchema.parse(reordered))).toBe(
      definitionHash(definition)
    );
  });

  it("changes when a commerce-relevant fact changes", () => {
    const repriced = ProductDefinitionSchema.parse({ ...definition, basePrice: 16_000 });

    expect(definitionHash(repriced)).not.toBe(definitionHash(definition));
  });
});

describe("nativeStateHash", () => {
  it("is stable under option-group, option and variant ordering", () => {
    const reordered: NativeProductState = {
      slug: "babafeszek",
      name: "Babafészek",
      optionGroups: [
        {
          code: "meret",
          name: "Méret",
          options: [
            { code: "nagy", name: "Nagy" },
            { code: "kicsi", name: "Kicsi" },
          ],
        },
      ],
      variants: [...nativeState.variants].toSorted((a, b) => b.sku.localeCompare(a.sku)),
    };

    expect(nativeStateHash(reordered)).toBe(nativeStateHash(nativeState));
  });

  it("changes when a native price, name or option assignment is edited", () => {
    const repriced: NativeProductState = {
      ...nativeState,
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--nagy" ? { ...variant, price: 99_000 } : variant
      ),
    };
    const renamed: NativeProductState = {
      ...nativeState,
      optionGroups: nativeState.optionGroups.map((group) =>
        group.code === "meret" ? { ...group, name: "Méret!" } : group
      ),
    };
    const reassigned: NativeProductState = {
      ...nativeState,
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--nagy"
          ? { ...variant, options: [{ groupCode: "meret", optionCode: "kicsi" }] }
          : variant
      ),
    };

    expect(nativeStateHash(repriced)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(renamed)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(reassigned)).not.toBe(nativeStateHash(nativeState));
  });
});
