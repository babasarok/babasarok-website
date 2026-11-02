import type { ProductDefinition } from "@babasarok/product-definition";
import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { LanguageCode } from "@vendure/core";
import { describe, expect, it } from "vitest";
import { LineSelectionsError, parseLineSelections } from "@babasarok/pricing";
import { computeLineUnitPrice, LinePricingError, valueConfiguredLine } from "./line-price";

const unitProduct = ProductDefinitionSchema.parse({
  id: "parna",
  orderable: true,
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
  orderable: true,
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

const unitCodes = (
  meret: string,
  fodor: "igen" | "nem",
  anyag: string
): ReadonlyMap<string, string> =>
  new Map([
    ["meret", meret],
    ["fodor", fodor],
    ["anyag", anyag],
  ]);

describe("computeLineUnitPrice", () => {
  it("reproduces the variant's synced price for a plain option combination", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      variantListPrice: 9000 + 2000 + 1800 + 3000,
      optionCodes: unitCodes("50", "igen", "wellsoft"),
      selections: {},
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(15_800);
  });

  it("adds a color-choice pick, but nothing when unselected", () => {
    const withPick = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      variantListPrice: 9000,
      optionCodes: unitCodes("40", "igen", "minky"),
      selections: { szin: { kind: "option", value: "piros" } },
      lengthCm: null,
      languageCode: "hu",
    });

    expect(withPick).toBe(9500);

    const withoutPick = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      variantListPrice: 9000,
      optionCodes: unitCodes("40", "igen", "minky"),
      selections: {},
      lengthCm: null,
      languageCode: "hu",
    });

    expect(withoutPick).toBe(9000);
  });

  it("adds a visible input's price even while empty, and hides dependents", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      variantListPrice: 9000,
      optionCodes: unitCodes("40", "nem", "minky"),
      selections: { felirat: { kind: "input", value: "" } },
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(10_500);
  });

  it("prices per-word embroidery by the word count of the entered text", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      variantListPrice: 9000,
      optionCodes: unitCodes("40", "nem", "minky"),
      selections: {
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
      variantListPrice: 9000,
      optionCodes: unitCodes("40", "nem", "minky"),
      selections: {},
      lengthCm: null,
      languageCode: "hu",
    });

    expect(price).toBe(9000);
  });

  it("prices a length product per metre, including embroidery", () => {
    const price = computeLineUnitPrice({
      productName: "Termék",
      definition: lengthProduct,
      variantListPrice: 0,
      optionCodes: new Map([
        ["sizes", "380"],
        ["fonas", "6"],
        ["anyag", "teddy"],
      ]),
      selections: { hímzés: { kind: "embroidery", text: "Ana", colorId: "piros" } },
      lengthCm: 380,
      languageCode: "hu",
    });

    expect(price).toBe(Math.round((14_000 + 400 + 2500) * 3.8));
  });

  it("throws when a length-priced line has no length", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Termék",
        definition: lengthProduct,
        variantListPrice: 0,
        optionCodes: new Map([
          ["sizes", "200"],
          ["fonas", "3"],
          ["anyag", "velur"],
        ]),
        selections: {},
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(LinePricingError);
  });

  it("refuses a custom value on a field the variant matrix carries", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Termék",
        definition: lengthProduct,
        variantListPrice: 0,
        optionCodes: new Map([
          ["sizes", "200"],
          ["fonas", "3"],
          ["anyag", "velur"],
        ]),
        selections: { fonas: { kind: "custom", value: "7" } },
        lengthCm: 200,
        languageCode: "hu",
      })
    ).toThrow(LinePricingError);
  });

  it("refuses selections that disagree with the variant", () => {
    expect(() =>
      computeLineUnitPrice({
        productName: "Termék",
        definition: unitProduct,
        variantListPrice: 9000,
        optionCodes: unitCodes("40", "nem", "minky"),
        selections: { anyag: { kind: "material", materialId: "wellsoft", colors: [] } },
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
        variantListPrice: 9000,
        optionCodes: unitCodes("40", "nem", "minky"),
        selections: { nincs: { kind: "input", value: "x" } },
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
        variantListPrice: 0,
        optionCodes: new Map([
          ["sizes", "200"],
          ["fonas", "3"],
          ["anyag", "teddy"],
        ]),
        selections: {},
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(/Fonott rácsvédő.*hossz/);
  });

  it("refuses to price a non-orderable product even with valid selections", () => {
    const browseOnly = ProductDefinitionSchema.parse({ ...unitProduct, orderable: false });

    expect(() =>
      computeLineUnitPrice({
        productName: "Párna",
        definition: browseOnly,
        variantListPrice: 9000,
        optionCodes: unitCodes("40", "nem", "minky"),
        selections: {},
        lengthCm: null,
        languageCode: "hu",
      })
    ).toThrow(/Párna.*nem rendelhető/);
  });
});

describe("parseLineSelections", () => {
  it("parses an empty value into no records", () => {
    expect(parseLineSelections(null)).toEqual({});
    expect(parseLineSelections("")).toEqual({});
  });

  it("round-trips records through JSON", () => {
    const selections = {
      anyag: { kind: "material", materialId: "wellsoft", colors: ["piros", "kek"] },
    };

    expect(parseLineSelections(JSON.stringify(selections))).toEqual(selections);
  });

  it("throws a descriptive error for malformed JSON and wrong shapes", () => {
    expect(() => parseLineSelections("{")).toThrow(LineSelectionsError);
    expect(() => parseLineSelections('{"anyag": {"kind": "nope"}}')).toThrow(LineSelectionsError);
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
      variantListPrice: 0,
      optionCodes: new Map([
        ["sizes", "200"],
        ["fonas", "3"],
        ["anyag", "velur"],
        ["gumiparositas", "nem"],
        ["masni", "igen"],
      ]),
      selections: {},
      lengthCm: 200,
      languageCode: "hu",
    });
    const visible = computeLineUnitPrice({
      productName: "Termék",
      definition,
      variantListPrice: 0,
      optionCodes: new Map([
        ["sizes", "200"],
        ["fonas", "3"],
        ["anyag", "velur"],
        ["gumiparositas", "igen"],
        ["masni", "igen"],
      ]),
      selections: {},
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
      variantListPrice: 0,
      optionCodes: new Map([
        ["sizes", "200"],
        ["fonas", "3"],
        ["anyag", "teddy"],
      ]),
      selections: {},
      lengthCm: 200,
      languageCode: "hu",
    });
    const velur = computeLineUnitPrice({
      productName: "Termék",
      definition: lengthProduct,
      variantListPrice: 0,
      optionCodes: new Map([
        ["sizes", "200"],
        ["fonas", "3"],
        ["anyag", "velur"],
      ]),
      selections: {},
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
    variantListPrice: 9000,
    optionCodes: new Map<string, string>(),
    selections: {},
    lengthCm: null,
    languageCode: LanguageCode.hu,
  };

  it("prices an orderable definition", () => {
    expect(valueConfiguredLine({ ...input, definition: { ...unitProduct, fields: [] } })).toEqual({
      kind: "priced",
      price: 9000,
    });
  });

  it("marks a non-orderable definition invalid, naming the product", () => {
    const result = valueConfiguredLine({
      ...input,
      definition: { ...unitProduct, orderable: false },
    });

    expect(result).toEqual({
      kind: "invalid",
      message: 'Árazási hiba (Párna): A(z) "Párna" termék jelenleg nem rendelhető.',
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
