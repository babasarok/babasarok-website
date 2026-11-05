import {
  ProductDefinitionSchema,
  type ProductDefinition,
} from "../../shared/product-definition/index";
import { describe, expect, it } from "vitest";
import { nativeStateHash, type NativeProductState } from "./sync-state";
import {
  plannedNativeState,
  planVariantCombinations,
  variantNamesUseProductName,
} from "./variant-plan";
import type { MaterialFacetData } from "./facet-plan";

// The specimen product's shape (src/content/product/babafeszek.md), parsed
// through the canonical schema so ids carry their brands. The product's name
// is a planner parameter (ADR 0011 decision 1: the native Product owns it).
const babafeszek: ProductDefinition = ProductDefinitionSchema.parse({
  id: "babafeszek",
  revision: "rev-1",
  orderable: true,
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "35x65", label: { hu: "Normál" }, price: 0 },
        { id: "40x75", label: { hu: "Közepes" }, price: 1500 },
        { id: "50x90", label: { hu: "XXL" }, price: 5000 },
      ],
    },
    {
      kind: "toggle",
      id: "betet",
      label: { hu: "Betét" },
      visibility: { kind: "always" },
      price: 3700,
    },
    {
      kind: "toggle",
      id: "fodor",
      label: { hu: "Fodorral kérem" },
      visibility: { kind: "always" },
      price: 4000,
    },
    {
      kind: "material",
      id: "anyag1",
      label: { hu: "Anyag 1" },
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
      label: { hu: "Anyag 2" },
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

const materials: ReadonlyMap<string, MaterialFacetData> = new Map([
  ["teddy", { label: { hu: "Teddy" }, colors: [{ id: "barna", label: { hu: "Barna" } }] }],
  ["wellsoft", { label: { hu: "Wellsoft" }, colors: [] }],
  ["waffle", { label: { hu: "Waffle" }, colors: [{ id: "kek", label: { hu: "Kék" } }] }],
]);

describe("planVariantCombinations", () => {
  it("generates one option group per variant-carrying field", () => {
    const plan = planVariantCombinations(babafeszek, materials, { hu: "Babafészek" });

    expect(plan.optionGroups.map((group) => group.code)).toEqual([
      "meret",
      "betet",
      "fodor",
      "anyag1",
      "anyag2",
    ]);
    expect(plan.optionGroups.find((group) => group.code === "anyag1")?.options).toEqual([
      { code: "teddy", name: { hu: "Teddy" }, price: 0 },
      { code: "wellsoft", name: { hu: "Wellsoft" }, price: 0 },
      { code: "waffle", name: { hu: "Waffle" }, price: 0 },
    ]);
  });

  it("enumerates the full product minus the forbidden combinations", () => {
    const plan = planVariantCombinations(babafeszek, materials, { hu: "Babafészek" });

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
    const plan = planVariantCombinations(babafeszek, materials, { hu: "Babafészek" });
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
      fields: [
        {
          kind: "input",
          id: "szoveg",
          label: { hu: "Szöveg" },
          visibility: { kind: "always" },
          required: true,
          price: 0,
        },
        {
          kind: "embroidery",
          id: "himzes",
          label: { hu: "Hímzés" },
          visibility: { kind: "always" },
          pricing: { kind: "per-word", pricePerWord: 500 },
        },
      ],
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, materials, { hu: "Egyéb" });

    expect(plan.optionGroups).toEqual([]);
    expect(plan.variants).toEqual([
      { sku: "egyeb", name: { hu: "Egyéb" }, price: 15_000, optionCodes: [], materialSlugs: [] },
    ]);
  });

  it("keeps color-presentation choice fields out of the variant matrix", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      fields: [
        ...babafeszek.fields,
        {
          kind: "choice",
          id: "szin",
          label: { hu: "Szín" },
          presentation: "color",
          visibility: { kind: "always" },
          options: [
            { id: "piros", label: { hu: "Piros" }, price: 0 },
            { id: "kek", label: { hu: "Kék" }, price: 500 },
          ],
        },
      ],
    });

    const plan = planVariantCombinations(definition, materials, { hu: "Babafészek" });
    const planned = plannedNativeState(definition, materials, { hu: "Babafészek" });

    expect(plan.optionGroups.map((group) => group.code)).toEqual([
      "meret",
      "betet",
      "fodor",
      "anyag1",
      "anyag2",
    ]);
    expect(plan.variants).toHaveLength(3 * 2 * 2 * 3 * 3 - 3 * 2 * 2);
    expect(planned.optionGroups.map((group) => group.code)).toEqual(
      plan.optionGroups.map((group) => group.code)
    );
  });

  it("leaves length-priced variants at 0 Ft — their price is length-dependent", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      id: "racsvedo",
      basePrice: 0,
      pricing: { kind: "length", sourceFieldId: "meret" },
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, materials, { hu: "Rácsvédő" });

    expect(plan.variants).toHaveLength(3 * 2 * 2 * 3 * 3);
    expect(plan.variants.every((variant) => variant.price === 0)).toBe(true);
  });

  it("prices a variant's hidden axis options at nothing — the form cannot select them", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      id: "polya",
      fields: [
        {
          kind: "toggle",
          id: "gumiskoto",
          label: { hu: "Gumis átkötő" },
          visibility: { kind: "always" },
          price: 800,
        },
        {
          kind: "toggle",
          id: "masni",
          label: { hu: "Masni" },
          visibility: { kind: "when-equal", fieldId: "gumiskoto", value: true },
          price: 500,
        },
      ],
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, materials, { hu: "Pólya" });
    const priceOf = (codes: readonly string[]): number | undefined =>
      plan.variants.find((variant) => variant.optionCodes.join("-") === codes.join("-"))?.price;

    expect(plan.optionGroups.map((group) => group.code)).toEqual(["gumiskoto", "masni"]);
    expect(priceOf(["nem", "nem"])).toBe(15_000);
    expect(priceOf(["nem", "igen"])).toBe(15_000);
    expect(priceOf(["igen", "nem"])).toBe(15_800);
    expect(priceOf(["igen", "igen"])).toBe(16_300);
  });

  it("labels every value with its field", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      id: "egyedi",
      fields: [
        {
          kind: "choice",
          id: "meret",
          label: { hu: "Méret" },
          presentation: "radio",
          visibility: { kind: "always" },
          options: [{ id: "35x65", label: { hu: "Normál" }, price: 0 }],
        },
        {
          kind: "material",
          id: "anyag",
          label: { hu: "Anyag" },
          colorCount: { kind: "fixed", count: 1 },
          options: [{ materialId: "teddy", price: 0 }],
        },
      ],
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, materials, { hu: "Egyedi" });

    expect(plan.variants.map((variant) => variant.name.hu)).toEqual([
      "Méret: Normál · Anyag: Teddy",
    ]);
  });

  it("names a toggle by its label when on, omits it when off and falls back to the product name", () => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      id: "masnis",
      fields: [
        {
          kind: "toggle",
          id: "masni",
          label: { hu: "Masni" },
          visibility: { kind: "always" },
          price: 300,
        },
      ],
      forbiddenMaterialCombinations: [],
    });

    const plan = planVariantCombinations(definition, materials, { hu: "Masnis" });

    expect(plan.variants.map((variant) => variant.name.hu)).toEqual(["Masnis", "Masni"]);
  });
});

describe("plannedNativeState", () => {
  it("produces exactly the native state a sync writes, hashable for staleness", () => {
    const planned = plannedNativeState(babafeszek, materials, { hu: "Babafészek" });

    // The sync derives the variant names from the native product's name and
    // the groups/variants from the plan; the staleness flag compares hashes
    // of the two states. The product's own name and slug are not part of the
    // state (ADR 0011 decision 1).
    expect(planned.optionGroups.map((group) => group.code)).toEqual([
      "meret",
      "betet",
      "fodor",
      "anyag1",
      "anyag2",
    ]);
    expect(planned.variants).toHaveLength(3 * 2 * 2 * 3 * 3 - 3 * 2 * 2);
    expect(planned.variants.every((variant) => variant.options.length === 5)).toBe(true);
  });

  it("carries the materials' facet values on every variant, and none without material fields", () => {
    const planned = plannedNativeState(babafeszek, materials, { hu: "Babafészek" });

    expect(
      planned.variants.find((variant) => variant.sku === "babafeszek--35x65-nem-nem-wellsoft-teddy")
        ?.facetValues
    ).toEqual(["wellsoft", "teddy", "teddy--barna"]);

    const choiceOnly = plannedNativeState(
      ProductDefinitionSchema.parse({
        ...babafeszek,
        id: "egyeb",
        fields: [babafeszek.fields[0]],
        forbiddenMaterialCombinations: [],
      }),
      materials,
      { hu: "Egyéb" }
    );

    expect(choiceOnly.variants[0]?.facetValues).toEqual([]);
  });

  it("reads facet drift into the hash", () => {
    const planned = plannedNativeState(babafeszek, materials, { hu: "Babafészek" });
    const refaceted: NativeProductState = {
      ...planned,
      variants: planned.variants.map((variant) => ({ ...variant, facetValues: [] })),
    };
    const reversed: NativeProductState = {
      ...planned,
      variants: planned.variants.map((variant) => ({
        ...variant,
        facetValues: [...variant.facetValues].toSorted((a, b) => b.localeCompare(a)),
      })),
    };

    expect(nativeStateHash(refaceted)).not.toBe(nativeStateHash(planned));
    expect(nativeStateHash(reversed)).toBe(nativeStateHash(planned));
  });
});

describe("variantNamesUseProductName", () => {
  const toggle = babafeszek.fields[1];
  const material = babafeszek.fields[3];

  it.each([
    ["choices, toggles and materials", babafeszek.fields],
    ["toggles only", [toggle]],
    ["no variant axis", []],
    ["materials only", [material]],
  ])("matches whether a planned variant carries the product name: %s", (_, fields) => {
    const definition = ProductDefinitionSchema.parse({
      ...babafeszek,
      fields,
      forbiddenMaterialCombinations: [],
    });
    const named = planVariantCombinations(definition, materials, { hu: "Termék" }).variants.some(
      (variant) => variant.name.hu === "Termék"
    );

    expect(variantNamesUseProductName(definition)).toBe(named);
  });
});
