import { describe, expect, it } from "vitest";
import {
  MaterialDefinitionSchema,
  ProductDefinitionSchema,
  ProductFieldSchema,
  type MaterialDefinition,
  type ProductDefinition,
} from "../../shared/product-definition/index";
import {
  capDetails,
  definitionDetails,
  materialDetails,
  productDetails,
  type ProductSnapshot,
} from "./details";

describe("definitionDetails", () => {
  const base = ProductDefinitionSchema.parse({
    id: "fonott-babafeszek",
    basePrice: 1000,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
  });

  it("is empty when nothing changed", () => {
    const revised = ProductDefinitionSchema.parse({ ...base, revision: "rev-1" });

    expect(definitionDetails(base, revised)).toEqual([]);
  });

  it("reports a base price change with its formatted values", () => {
    const raised = ProductDefinitionSchema.parse({ ...base, basePrice: 2500 });

    expect(definitionDetails(base, raised)).toEqual([
      { field: "Alapár", from: "1000 Ft", to: "2500 Ft" },
    ]);
  });

  it("reports a pricing kind switch through the pricing formatter", () => {
    const lengthPriced = ProductDefinitionSchema.parse({
      ...base,
      pricing: { kind: "length", sourceFieldId: "hossz" },
    });

    expect(definitionDetails(base, lengthPriced)).toEqual([
      { field: "Árazás", from: "egységár", to: "hossz alapú (mező: hossz)" },
    ]);
  });

  it("reports a field price change matched by field id", () => {
    const before = ProductDefinitionSchema.parse({
      ...base,
      fields: [inputField("hossz", "Hossz", 100)],
    });
    const after = ProductDefinitionSchema.parse({
      ...base,
      fields: [inputField("hossz", "Hossz", 150)],
    });

    expect(definitionDetails(before, after)).toEqual([
      { field: "Mezők / hossz / Ár", from: "100 Ft", to: "150 Ft" },
    ]);
  });

  it("reports a localized label change per language", () => {
    const before = ProductDefinitionSchema.parse({
      ...base,
      fields: [inputField("hossz", "Hossz", 100)],
    });
    const after = ProductDefinitionSchema.parse({
      ...base,
      fields: [{ ...inputField("hossz", "Hossz", 100), label: { hu: "Hosszúság", en: "Length" } }],
    });

    expect(definitionDetails(before, after)).toEqual([
      { field: "Mezők / hossz / Címke (hu)", from: "Hossz", to: "Hosszúság" },
      { field: "Mezők / hossz / Címke (en)", from: null, to: "Length" },
    ]);
  });

  it("reports added and removed fields", () => {
    const before = ProductDefinitionSchema.parse({
      ...base,
      fields: [inputField("hossz", "Hossz", 100)],
    });
    const after = ProductDefinitionSchema.parse({
      ...base,
      fields: [inputField("hossz", "Hossz", 100), inputField("felirat", "Felirat", 500)],
    });

    expect(definitionDetails(before, after)).toEqual([
      { field: "Mezők / felirat", from: null, to: "„Felirat” (felirat, beviteli mező)" },
    ]);
  });

  it("reports forbidden combination changes as one line", () => {
    const before = ProductDefinitionSchema.parse({
      ...base,
      forbiddenMaterialCombinations: [["fa", "masik"]],
    });
    const after = ProductDefinitionSchema.parse({
      ...base,
      forbiddenMaterialCombinations: [
        ["fa", "masik"],
        ["gyongy", "barsony"],
      ],
    });

    expect(definitionDetails(before, after)).toEqual([
      {
        field: "Tiltott anyag-kombinációk",
        from: "fa+masik",
        to: "fa+masik, gyongy+barsony",
      },
    ]);
  });
});

describe("materialDetails", () => {
  const feherColor = {
    id: "feher",
    label: { hu: "Fehér" },
    appearance: { kind: "hex", value: "#ffffff" },
  };
  const base: MaterialDefinition = MaterialDefinitionSchema.parse({
    id: "pamut",
    label: { hu: "Pamut" },
    colors: [feherColor],
  });

  it("reports a subtitle change keyed by language", () => {
    expect(materialDetails(base, { ...base, subtitle: { hu: "Puha pamut" } })).toEqual([
      { field: "Alcím (hu)", from: null, to: "Puha pamut" },
    ]);
  });

  it("reports a color's hex change matched by color id", () => {
    const after: MaterialDefinition = MaterialDefinitionSchema.parse({
      ...base,
      colors: [{ ...feherColor, appearance: { kind: "hex", value: "#000000" } }],
    });

    expect(materialDetails(base, after)).toEqual([
      { field: "Színek/minták / feher / Megjelenés / Hex kód", from: "#ffffff", to: "#000000" },
    ]);
  });

  it("reports a thumbnail being set", () => {
    expect(materialDetails(base, { ...base, thumbnail: { assetId: "5" } })).toEqual([
      { field: "Bélyegkép", from: null, to: "kép #5" },
    ]);
  });

  it("truncates long descriptions", () => {
    const long = "x".repeat(300);
    const details = materialDetails(base, { ...base, description: { hu: long } });

    expect(details).toHaveLength(1);

    const [first] = details;

    expect(first.to).toBe(`${"x".repeat(160)}…`);
  });
});

describe("productDetails", () => {
  const huTranslation = {
    languageCode: "hu",
    name: "Fonott babafeszek",
    slug: "fonott-babafeszek",
    description: "",
    shortDescription: null,
    tagline: null,
  };
  const base: ProductSnapshot = {
    enabled: true,
    featuredAssetId: null,
    iconId: null,
    date: null,
    popularityRank: null,
    translations: [huTranslation],
  };

  it("reports a rename on the hu translation", () => {
    const after: ProductSnapshot = {
      ...base,
      translations: [{ ...huTranslation, name: "Fonott babafészek" }],
    };

    expect(productDetails(base, after)).toEqual([
      { field: "Fordítás / hu / Név", from: "Fonott babafeszek", to: "Fonott babafészek" },
    ]);
  });

  it("reports the orderability switch", () => {
    expect(productDetails(base, { ...base, enabled: false })).toEqual([
      { field: "Rendelhető", from: "igen", to: "nem" },
    ]);
  });

  it("reports a popularity rank change", () => {
    expect(productDetails(base, { ...base, popularityRank: 3 })).toEqual([
      { field: "Népszerűségi sorrend", from: null, to: "3" },
    ]);
  });
});

describe("capDetails", () => {
  it("collapses a long diff into a bounded list", () => {
    const details = Array.from({ length: 30 }, (_, index) => ({
      field: `Mező ${index}`,
      from: "a",
      to: "b",
    }));
    const capped = capDetails(details);

    expect(capped).toHaveLength(21);
    expect(capped[20]).toEqual({ field: "… további 10 változás", from: null, to: null });
  });

  it("keeps short diffs intact", () => {
    const details = [{ field: "Alapár", from: "a", to: "b" }];

    expect(capDetails(details)).toEqual(details);
  });
});

function inputField(id: string, label: string, price: number): ProductDefinition["fields"][number] {
  return ProductFieldSchema.parse({
    kind: "input",
    id,
    label: { hu: label },
    visibility: { kind: "always" },
    required: false,
    price,
  });
}
