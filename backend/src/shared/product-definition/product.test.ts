import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { FieldVisibilitySchema, PatternSchema } from "./field.ts";
import { ChoiceFieldSchema } from "./field-kinds/choice.ts";
import { EmbroideryFieldSchema } from "./field-kinds/embroidery.ts";
import type { InputFieldSchema } from "./field-kinds/input.ts";
import { MaterialFieldSchema } from "./field-kinds/material.ts";
import { ToggleFieldSchema } from "./field-kinds/toggle.ts";
import {
  ForbiddenMaterialCombinationSchema,
  ProductDefinitionSchema,
  ProductPricingSchema,
  type ProductDefinition,
} from "./product.ts";
import { productRevision } from "./revision.ts";

const inputFixture: z.input<typeof InputFieldSchema> = {
  id: "szoveg",
  label: { hu: "Szöveg" },
  kind: "input",
  visibility: { kind: "always" },
  required: true,
  price: 0,
  placeholder: { hu: "Név" },
  pattern: "^[a-z]+$",
  suggestions: [{ value: "Nez", label: { hu: "Nez" } }],
};

const choiceFixture = (
  presentation: z.input<typeof ChoiceFieldSchema>["presentation"]
): z.input<typeof ChoiceFieldSchema> => ({
  id: "szin",
  label: { hu: "Szín" },
  kind: "choice",
  presentation,
  visibility: { kind: "when-present", fieldId: "szin" },
  options: [{ id: "feher", label: { hu: "Fehér" }, price: 100 }],
});

const toggleFixture: z.input<typeof ToggleFieldSchema> = {
  id: "varr",
  label: { hu: "Varrás" },
  kind: "toggle",
  visibility: { kind: "when-equal", fieldId: "szin", value: true },
  price: 500,
};

const materialFixture: z.input<typeof MaterialFieldSchema> = {
  id: "anyag",
  label: { hu: "Anyag" },
  kind: "material",
  options: [{ materialId: "pamut", price: 0 }],
  colorCount: { kind: "fixed", count: 2 },
};

const embroideryFixture: z.input<typeof EmbroideryFieldSchema> = {
  id: "varrascikksz",
  label: { hu: "Varráscikk" },
  kind: "embroidery",
  visibility: { kind: "always" },
  pricing: { kind: "flat", price: 2000 },
  placeholder: { hu: "Üzenet" },
  pattern: String.raw`^\S+$`,
};

const productFixture = (
  presentation: z.input<typeof ChoiceFieldSchema>["presentation"]
): z.input<typeof ProductDefinitionSchema> => ({
  id: "pamut-lepedo",
  revision: "2f8a1c",
  orderable: true,
  basePrice: 20_000,
  pricing: { kind: "unit" },
  fields: [
    inputFixture,
    choiceFixture(presentation),
    toggleFixture,
    materialFixture,
    embroideryFixture,
  ],
  forbiddenMaterialCombinations: [["pamut", "szunyok"]],
});

describe("ProductDefinitionSchema", () => {
  const choicePresentations: z.input<typeof ChoiceFieldSchema>["presentation"][] = [
    "select",
    "radio",
    "color",
  ];

  it.each(choicePresentations)(
    "parses a valid ProductDefinition with a %s choice field",
    (presentation) => {
      const definition = productFixture(presentation);
      expect(ProductDefinitionSchema.parse(definition)).toEqual(definition);
    }
  );

  it("accepts length pricing", () => {
    expect(ProductPricingSchema.parse({ kind: "length", sourceFieldId: "meret" })).toEqual({
      kind: "length",
      sourceFieldId: "meret",
    });
  });

  it("accepts field-referenced material color counts", () => {
    expect(
      MaterialFieldSchema.safeParse({
        ...materialFixture,
        colorCount: { kind: "from-field", fieldId: "meret" },
      }).success
    ).toBe(true);
  });

  it("accepts per-word embroidery pricing", () => {
    expect(
      EmbroideryFieldSchema.safeParse({
        ...embroideryFixture,
        pricing: { kind: "per-word", pricePerWord: 500 },
      }).success
    ).toBe(true);
  });

  it("rejects a label — the native Product owns the name (ADR 0011 decision 1)", () => {
    expect(
      ProductDefinitionSchema.safeParse({ ...productFixture("select"), label: "Pamut lepedő" })
        .success
    ).toBe(false);
  });
});

describe("member properties are not shared across union members", () => {
  it.each([
    {
      name: "material field with visibility",
      result: MaterialFieldSchema.safeParse({
        ...materialFixture,
        visibility: { kind: "always" },
      }),
    },
    {
      name: "choice field with colorCount",
      result: ChoiceFieldSchema.safeParse({
        ...choiceFixture("select"),
        colorCount: { kind: "fixed", count: 2 },
      }),
    },
    {
      name: "toggle field with options",
      result: ToggleFieldSchema.safeParse({
        ...toggleFixture,
        options: [{ materialId: "pamut", price: 0 }],
      }),
    },
    {
      name: "when-present visibility with value",
      result: FieldVisibilitySchema.safeParse({
        kind: "when-present",
        fieldId: "szin",
        value: "feher",
      }),
    },
    {
      name: "always visibility with fieldId",
      result: FieldVisibilitySchema.safeParse({ kind: "always", fieldId: "szin" }),
    },
    {
      name: "flat embroidery pricing with pricePerWord",
      result: EmbroideryFieldSchema.safeParse({
        ...embroideryFixture,
        pricing: { kind: "flat", price: 2000, pricePerWord: 100 },
      }),
    },
    {
      name: "unit pricing with sourceFieldId",
      result: ProductPricingSchema.safeParse({ kind: "unit", sourceFieldId: "meret" }),
    },
  ])("$name", ({ result }) => {
    expect(result.success).toBe(false);
  });
});

describe("material color count rejects ambiguous states", () => {
  it.each([
    {
      name: "fixed with fieldId",
      colorCount: { kind: "fixed", count: 2, fieldId: "meret" },
    },
    {
      name: "from-field with count",
      colorCount: { kind: "from-field", fieldId: "meret", count: 2 },
    },
    { name: "count 0", colorCount: { kind: "fixed", count: 0 } },
    { name: "count 1.5", colorCount: { kind: "fixed", count: 1.5 } },
  ])("$name", ({ colorCount }) => {
    expect(MaterialFieldSchema.safeParse({ ...materialFixture, colorCount }).success).toBe(false);
  });
});

describe("ProductDefinitionSchema revision", () => {
  it("accepts a missing revision — the server sets it on save", () => {
    const { revision: _omitted, ...definition } = productFixture("select");
    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(true);
  });

  it("rejects a blank revision", () => {
    const definition = { ...productFixture("select"), revision: " " };
    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(false);
  });
});

describe("FieldVisibilitySchema", () => {
  it("rejects when-equal without a fieldId", () => {
    expect(FieldVisibilitySchema.safeParse({ kind: "when-equal", value: "feher" }).success).toBe(
      false
    );
  });
});

describe("PatternSchema", () => {
  it("rejects an invalid regular expression", () => {
    expect(PatternSchema.safeParse("(").success).toBe(false);
  });

  it("accepts a valid regular expression", () => {
    expect(PatternSchema.parse(String.raw`^(\d+)$`)).toBe(String.raw`^(\d+)$`);
  });
});

describe("ForbiddenMaterialCombinationSchema", () => {
  it("rejects a single-member combination", () => {
    expect(ForbiddenMaterialCombinationSchema.safeParse(["pamut"]).success).toBe(false);
  });

  it("accepts a duplicate pair", () => {
    expect(ForbiddenMaterialCombinationSchema.parse(["pamut", "pamut"])).toEqual([
      "pamut",
      "pamut",
    ]);
  });
});

describe("productRevision", () => {
  const definition: ProductDefinition = ProductDefinitionSchema.parse({
    id: "babafeszek",
    revision: "rev-1",
    orderable: true,
    basePrice: 15_000,
    pricing: { kind: "unit" },
    fields: [
      {
        kind: "toggle",
        id: "betet",
        label: { hu: "Betét" },
        visibility: { kind: "always" },
        price: 3700,
      },
    ],
    forbiddenMaterialCombinations: [],
  });

  it("is stable under key order and irrelevant normalization", () => {
    const reordered = ProductDefinitionSchema.parse({
      forbiddenMaterialCombinations: [],
      fields: [
        {
          price: 3700,
          visibility: { kind: "always" },
          label: { hu: "Betét" },
          id: "betet",
          kind: "toggle",
        },
      ],
      pricing: { kind: "unit" },
      basePrice: 15_000,
      orderable: true,
      revision: "rev-1",
      id: "babafeszek",
    });

    expect(productRevision(reordered)).toBe(productRevision(definition));
  });

  it("changes when a commerce-relevant fact changes", () => {
    expect(productRevision({ ...definition, basePrice: 16_000 })).not.toBe(
      productRevision(definition)
    );
  });

  it("ignores the revision field itself", () => {
    const revised = { ...definition, revision: "rev-2" };

    expect(productRevision(revised)).toBe(productRevision(definition));
  });
});
