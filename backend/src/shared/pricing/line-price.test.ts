import type { ProductDefinition } from "../product-definition/index";
import { ProductDefinitionSchema } from "../product-definition/index";
import { describe, expect, it } from "vitest";
import {
  LineSelectionsError,
  parseLineSelections,
  type LineSelections,
} from "../product-definition/index";
import { computeLineUnitPrice, LinePricingError, valueConfiguredLine } from "./line-price";

const unitProduct = ProductDefinitionSchema.parse({
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
      kind: "toggle",
      id: "fodor",
      label: { hu: "Fodorral" },
      visibility: { kind: "always" },
      price: 1800,
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
    {
      kind: "choice",
      id: "szin",
      label: { hu: "Szín" },
      presentation: "color",
      visibility: { kind: "when-equal", fieldId: "fodor", value: true },
      options: [
        { id: "piros", label: { hu: "Piros" }, price: 500 },
        { id: "kek", label: { hu: "Kék" }, price: 0 },
      ],
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
      kind: "input",
      id: "extra",
      label: { hu: "Extra" },
      visibility: { kind: "when-present", fieldId: "felirat" },
      required: false,
      price: 1500,
    },
    {
      kind: "embroidery",
      id: "hímzés",
      label: { hu: "Hímzés" },
      visibility: { kind: "always" },
      pricing: { kind: "per-word", pricePerWord: 700 },
    },
  ],
});

const lengthProduct = ProductDefinitionSchema.parse({
  id: "fonott-racsvedo",
  basePrice: 0,
  pricing: { kind: "length", sourceFieldId: "sizes" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "sizes",
      label: { hu: "Méret" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "200", label: { hu: "200cm" }, price: 0 },
        { id: "380", label: { hu: "380cm" }, price: 0 },
      ],
      customValue: {},
    },
    {
      kind: "choice",
      id: "fonas",
      label: { hu: "Fonás" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "3", label: { hu: "Hármas" }, price: 8000 },
        { id: "6", label: { hu: "Hatos" }, price: 14_000 },
      ],
    },
    {
      kind: "material",
      id: "anyag",
      label: { hu: "Anyag" },
      colorCount: { kind: "from-field", fieldId: "fonas" },
      options: [
        { materialId: "velur", price: 0 },
        { materialId: "teddy", price: 400 },
      ],
    },
    {
      kind: "embroidery",
      id: "hímzés",
      label: { hu: "Hímzés" },
      visibility: { kind: "always" },
      pricing: { kind: "flat", price: 2500 },
    },
  ],
});

const unitSelections = (meret: string, fodor: "igen" | "nem", anyag: string): LineSelections => ({
  meret: { kind: "option", value: meret },
  fodor: { kind: "option", value: fodor },
  anyag: { kind: "material", materialId: anyag, colors: [] },
});

const lengthSelections = (sizes: string, fonas: string, anyag: string): LineSelections => ({
  sizes: { kind: "option", value: sizes },
  fonas: { kind: "option", value: fonas },
  anyag: { kind: "material", materialId: anyag, colors: [] },
});

describe("computeLineUnitPrice", () => {
  it("reproduces the variant's synced price for a plain option combination", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      selections: unitSelections("50", "igen", "wellsoft"),
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(15_800);
  });

  it("adds a color-choice pick, but nothing when unselected", () => {
    const withPick = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      selections: {
        ...unitSelections("40", "igen", "minky"),
        szin: { kind: "option", value: "piros" },
      },
      lengthCm: null,
      languageCode: "hu",
    });

    expect(withPick).toBe(9000 + 1800 + 500);

    const withoutPick = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      selections: unitSelections("40", "igen", "minky"),
      lengthCm: null,
      languageCode: "hu",
    });

    expect(withoutPick).toBe(9000 + 1800);
  });

  it("adds a visible input's price even while empty, and hides dependents", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      selections: {
        ...unitSelections("40", "nem", "minky"),
        felirat: { kind: "input", value: "" },
      },
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(10_500);
  });

  it("prices per-word embroidery by the word count of the entered text", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      selections: {
        ...unitSelections("40", "nem", "minky"),
        hímzés: { kind: "embroidery", text: "  kis  Ana ", colorId: "piros" },
      },
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(9000 + 1400);
  });

  it("ignores an unenabled embroidery", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      selections: unitSelections("40", "nem", "minky"),
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(9000);
  });

  it("prices a length product per metre, including embroidery", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: lengthProduct,
      selections: {
        ...lengthSelections("380", "6", "teddy"),
        hímzés: { kind: "embroidery", text: "Ana", colorId: "piros" },
      },
      lengthCm: 380,
      languageCode: "hu",
    });

    expect(price).toBe(Math.round((14_000 + 400 + 2500) * 3.8));
  });

  it("rounds a length product's unit price once, to whole forints", () => {
    const perMetre995 = ProductDefinitionSchema.parse({
      ...lengthProduct,
      basePrice: 995,
      fields: lengthProduct.fields.filter((field) => field.id === "sizes"),
    });

    expect(
      computeLineUnitPrice({
        productName: "Termék",
        definition: perMetre995,
        selections: { sizes: { kind: "option", value: "380" } },
        lengthCm: 335,
        languageCode: "hu",
      })
    ).toBe(3333);
  });

  it("throws when a length-priced line has no length", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Termék",
        definition: lengthProduct,
        selections: lengthSelections("200", "3", "velur"),
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(LinePricingError);
  });

  it("prices a custom value on a variant-axis field at the first listed option", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: lengthProduct,
      selections: {
        sizes: { kind: "custom", value: "240" },
        fonas: { kind: "custom", value: "7" },
      },
      lengthCm: 240,
      languageCode: "hu",
    });

    expect(price).toBe(19_200);
  });

  it("refuses a material the field does not offer", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Termék",
        definition: unitProduct,
        selections: {
          ...unitSelections("40", "nem", "minky"),
          anyag: { kind: "material", materialId: "nincs", colors: [] },
        },
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(LinePricingError);
  });

  it("refuses records for fields the definition does not know", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Termék",
        definition: unitProduct,
        selections: {
          ...unitSelections("40", "nem", "minky"),
          nincs: { kind: "input", value: "x" },
        },
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(LinePricingError);
  });

  it("names the product in the missing-length refusal", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Fonott rácsvédő",
        definition: lengthProduct,
        selections: lengthSelections("200", "3", "teddy"),
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(/Fonott rácsvédő.*hossz/);
  });
});

describe("parseLineSelections", () => {
  it("parses an empty value into no records", () => {
    expect(parseLineSelections(null, "hu")).toEqual({});
    expect(parseLineSelections("", "hu")).toEqual({});
  });

  it("round-trips records through JSON", () => {
    const selections = {
      anyag: { kind: "material", materialId: "wellsoft", colors: ["piros", "kek"] },
    };

    expect(parseLineSelections(JSON.stringify(selections), "hu")).toEqual(selections);
  });

  it("throws a descriptive error for malformed JSON and wrong shapes", () => {
    expect(() => parseLineSelections("{", "hu")).toThrow(LineSelectionsError);
    expect(() => parseLineSelections('{"anyag": {"kind": "nope"}}', "hu")).toThrow(
      LineSelectionsError
    );
  });

  it("rejects in the request language", () => {
    expect(() => parseLineSelections("{", "en")).toThrow(
      "The order line configuration is not valid JSON."
    );
  });
});

describe("length per-material pricing", () => {
  it("skips a hidden variant axis in the per-meter price", () => {
    const definition = ProductDefinitionSchema.parse({
      ...lengthProduct,
      fields: [
        ...lengthProduct.fields,
        {
          kind: "toggle",
          id: "gumiparositas",
          label: { hu: "Gumírozás" },
          visibility: { kind: "always" },
          price: 800,
        },
        {
          kind: "toggle",
          id: "masni",
          label: { hu: "Masni" },
          visibility: { kind: "when-equal", fieldId: "gumiparositas", value: true },
          price: 500,
        },
      ],
    });

    const hidden = computeLineUnitPrice({
      productName: "Termék",
      definition,
      selections: {
        ...lengthSelections("200", "3", "velur"),
        gumiparositas: { kind: "option", value: "nem" },
        masni: { kind: "option", value: "igen" },
      },
      lengthCm: 200,
      languageCode: "hu",
    });
    const visible = computeLineUnitPrice({
      productName: "Termék",
      definition,
      selections: {
        ...lengthSelections("200", "3", "velur"),
        gumiparositas: { kind: "option", value: "igen" },
        masni: { kind: "option", value: "igen" },
      },
      lengthCm: 200,
      languageCode: "hu",
    });

    expect(hidden).toBe(2 * 8000);
    expect(visible).toBe(2 * (8000 + 800 + 500));
  });

  it("scales each material's price with the length", () => {
    const teddy = computeLineUnitPrice({
      productName: "Termék",
      definition: lengthProduct,
      selections: lengthSelections("200", "3", "teddy"),
      lengthCm: 200,
      languageCode: "hu",
    });
    const velur = computeLineUnitPrice({
      productName: "Termék",
      definition: lengthProduct,
      selections: lengthSelections("200", "3", "velur"),
      lengthCm: 200,
      languageCode: "hu",
    });

    expect(teddy).toBe(2 * (8000 + 400));
    expect(velur).toBe(2 * 8000);
  });
});

describe("definition sanity", () => {
  it("keeps the fixtures valid definitions", () => {
    const definitions: ProductDefinition[] = [unitProduct, lengthProduct];

    expect(definitions.every((definition) => definition.fields.length > 0)).toBe(true);
  });
});

describe("valueConfiguredLine", () => {
  const input = {
    productName: "Párna",
    selections: {},
    lengthCm: null,
    languageCode: "hu",
  };

  it("prices a definition", () => {
    expect(valueConfiguredLine({ ...input, definition: { ...unitProduct, fields: [] } })).toEqual({
      kind: "priced",
      price: 9000,
    });
  });

  it("marks a selection of a removed field invalid", () => {
    const result = valueConfiguredLine({
      ...input,
      definition: unitProduct,
      selections: { torolt: { kind: "input", value: "x" } },
    });

    expect(result.kind).toBe("invalid");
  });
});
