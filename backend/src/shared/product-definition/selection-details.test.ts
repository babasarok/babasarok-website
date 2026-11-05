import { ProductDefinitionSchema } from "./product.ts";
import { describe, expect, it } from "vitest";
import { selectionDetails, type SelectionLabels } from "./selection-details.ts";
const definition = ProductDefinitionSchema.parse({
  id: "parna",
  orderable: true,
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      id: "meret",
      kind: "choice",
      label: { hu: "Méret", en: "Size" },
      presentation: "select",
      visibility: { kind: "always" },
      options: [
        { id: "kicsi", label: { hu: "Kicsi", en: "Small" }, price: 0 },
        { id: "nagy", label: { hu: "Nagy" }, price: 500 },
      ],
      customValue: {},
    },
    {
      id: "monogram",
      kind: "toggle",
      label: { hu: "Monogram" },
      visibility: { kind: "always" },
      price: 300,
    },
    {
      id: "felirat",
      kind: "input",
      label: { hu: "Felirat" },
      visibility: { kind: "when-equal", fieldId: "monogram", value: true },
      required: true,
      price: 0,
    },
    {
      id: "anyag",
      kind: "material",
      label: { hu: "Anyag" },
      options: [{ materialId: "pamut", price: 0 }],
      colorCount: { kind: "fixed", count: 2 },
    },
    {
      id: "hímzés",
      kind: "embroidery",
      label: { hu: "Hímzés" },
      visibility: { kind: "always" },
      pricing: { kind: "flat", price: 700 },
    },
  ],
});

const labels: SelectionLabels = {
  materials: new Map([
    [
      "pamut",
      {
        label: "Pamut",
        colors: new Map([
          ["feher", "Fehér"],
          ["kek", "Kék"],
        ]),
      },
    ],
  ]),
  threadColors: new Map([["arany", "Arany"]]),
};

const base = { definition, lengthCm: null, labels, languageCode: "hu" };

describe("selectionDetails", () => {
  it("lists the filled visible fields in definition order, indented by dependency", () => {
    const details = selectionDetails({
      ...base,
      selections: {
        felirat: { kind: "input", value: "Bence" },
        monogram: { kind: "option", value: "igen" },
        meret: { kind: "option", value: "nagy" },
        anyag: { kind: "material", materialId: "pamut", colors: ["feher", "kek"] },
        hímzés: { kind: "embroidery", text: "Szia", colorId: "arany" },
      },
    });

    expect(details).toEqual([
      { label: "Méret", value: "Nagy", depth: 0 },
      { label: "Monogram", value: "Igen", depth: 0 },
      { label: "Felirat", value: "Bence", depth: 1 },
      { label: "Anyag", value: "Pamut (Fehér, Kék)", depth: 0 },
      { label: "Hímzés", value: "Szia (Arany)", depth: 0 },
    ]);
  });

  it("drops a field whose dependency is not met", () => {
    const details = selectionDetails({
      ...base,
      selections: {
        monogram: { kind: "option", value: "nem" },
        felirat: { kind: "input", value: "Bence" },
      },
    });

    expect(details).toEqual([{ label: "Monogram", value: "Nem", depth: 0 }]);
  });

  it("shows a custom choice value and the line length", () => {
    const details = selectionDetails({
      ...base,
      lengthCm: 120,
      languageCode: "en",
      selections: { meret: { kind: "custom", value: "XXL" } },
    });

    expect(details).toEqual([
      { label: "Hossz", value: "120 cm", depth: 0 },
      { label: "Size", value: "Egyedi: XXL", depth: 0 },
    ]);
  });

  it("falls back to the stored ids when a label is gone", () => {
    const details = selectionDetails({
      ...base,
      selections: { anyag: { kind: "material", materialId: "torolt", colors: ["x"] } },
    });

    expect(details).toEqual([{ label: "Anyag", value: "torolt (x)", depth: 0 }]);
  });
});
