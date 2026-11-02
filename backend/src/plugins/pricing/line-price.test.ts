import type { ProductDefinition } from "@babasarok/product-definition";
import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import { LineSelectionsError, parseLineSelections } from "./line-selection";
import { computeLineUnitPrice, LinePricingError } from "./line-price";

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
      label: "Méret",
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "40", label: "40x40", price: 0 },
        { id: "50", label: "50x50", price: 2000 },
      ],
    },
    {
      kind: "toggle",
      id: "fodor",
      label: "Fodorral",
      visibility: { kind: "always" },
      price: 1800,
    },
    {
      kind: "material",
      id: "anyag",
      label: "Anyag",
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "wellsoft", price: 3000 },
        { materialId: "minky", price: 0 },
      ],
    },
    {
      kind: "choice",
      id: "szin",
      label: "Szín",
      presentation: "color",
      visibility: { kind: "when-equal", fieldId: "fodor", value: true },
      options: [
        { id: "piros", label: "Piros", price: 500 },
        { id: "kek", label: "Kék", price: 0 },
      ],
    },
    {
      kind: "input",
      id: "felirat",
      label: "Felirat",
      visibility: { kind: "always" },
      required: false,
      price: 0,
    },
    {
      kind: "input",
      id: "extra",
      label: "Extra",
      visibility: { kind: "when-present", fieldId: "felirat" },
      required: false,
      price: 1500,
    },
    {
      kind: "embroidery",
      id: "hímzés",
      label: "Hímzés",
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
      label: "Méret",
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "200", label: "200cm", price: 0 },
        { id: "380", label: "380cm", price: 0 },
      ],
      customValue: {},
    },
    {
      kind: "choice",
      id: "fonas",
      label: "Fonás",
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "3", label: "Hármas", price: 8000 },
        { id: "6", label: "Hatos", price: 14_000 },
      ],
    },
    {
      kind: "material",
      id: "anyag",
      label: "Anyag",
      colorCount: { kind: "from-field", fieldId: "fonas" },
      options: [
        { materialId: "velur", price: 0 },
        { materialId: "teddy", price: 400 },
      ],
    },
    {
      kind: "embroidery",
      id: "hímzés",
      label: "Hímzés",
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
    });

    expect(withPick).toBe(9500);

    const withoutPick = computeLineUnitPrice({
      productName: "Termék",
      definition: unitProduct,
      variantListPrice: 9000,
      optionCodes: unitCodes("40", "igen", "minky"),
      selections: {},
      lengthCm: null,
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
          label: "Gumírozás",
          visibility: { kind: "always" },
          price: 800,
        },
        {
          kind: "toggle",
          id: "masni",
          label: "Masni",
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
