import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { FieldVisibilitySchema, PatternSchema } from "./field";
import { ChoiceFieldSchema } from "./field-kinds/choice";
import { EmbroideryFieldSchema } from "./field-kinds/embroidery";
import type { InputFieldSchema } from "./field-kinds/input";
import { MaterialFieldSchema } from "./field-kinds/material";
import { ToggleFieldSchema } from "./field-kinds/toggle";
import {
  ForbiddenMaterialCombinationSchema,
  ProductDefinitionSchema,
  ProductPricingSchema,
  PRODUCT_TYPE_VALUES,
  type ProductDefinition,
} from "./product";
import { productRevision } from "./revision";

const inputFixture: z.input<typeof InputFieldSchema> = {
  id: "szoveg",
  label: "Szöveg",
  kind: "input",
  visibility: { kind: "always" },
  required: true,
  price: 0,
  placeholder: "Név",
  pattern: "^[a-z]+$",
  suggestions: [{ value: "Nez", label: "Nez" }],
};

const choiceFixture = (
  presentation: z.input<typeof ChoiceFieldSchema>["presentation"]
): z.input<typeof ChoiceFieldSchema> => ({
  id: "szin",
  label: "Szín",
  kind: "choice",
  presentation,
  visibility: { kind: "when-present", fieldId: "szin" },
  options: [{ id: "feher", label: "Fehér", price: 100 }],
});

const toggleFixture: z.input<typeof ToggleFieldSchema> = {
  id: "varr",
  label: "Varrás",
  kind: "toggle",
  visibility: { kind: "when-equal", fieldId: "szin", value: true },
  price: 500,
};

const materialFixture: z.input<typeof MaterialFieldSchema> = {
  id: "anyag",
  label: "Anyag",
  kind: "material",
  options: [{ materialId: "pamut", price: 0 }],
  colorCount: { kind: "fixed", count: 2 },
};

const embroideryFixture: z.input<typeof EmbroideryFieldSchema> = {
  id: "varrascikksz",
  label: "Varráscikk",
  kind: "embroidery",
  visibility: { kind: "always" },
  pricing: { kind: "flat", price: 2000 },
  placeholder: "Üzenet",
  pattern: String.raw`^\S+$`,
};

const productFixture = (
  presentation: z.input<typeof ChoiceFieldSchema>["presentation"]
): z.input<typeof ProductDefinitionSchema> => ({
  id: "pamut-lepedo",
  label: "Pamut lepedő",
  revision: "2f8a1c",
  type: "lepedo",
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

describe("PRODUCT_TYPE_VALUES", () => {
  it("covers every product type the schema accepts", () => {
    for (const value of PRODUCT_TYPE_VALUES) {
      expect(productFixture("select").type).toBeDefined();
      expect([
        "racsvedo",
        "takaro",
        "lepedo",
        "parna",
        "babafeszek",
        "zsak",
        "kiegeszito",
      ]).toContain(value);
    }
  });
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
