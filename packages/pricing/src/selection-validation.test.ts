import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import type { LineSelectionRecord, LineSelections } from "./line-selection.js";
import {
  MAX_SELECTION_TEXT_LENGTH,
  referencedMaterialIds,
  formatSelectionProblem,
  selectionsRejection,
  validateSelections,
} from "./selection-validation";

const definition = ProductDefinitionSchema.parse({
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
      options: [{ id: "40", label: { hu: "40x40" }, price: 0 }],
      customValue: { pattern: String.raw`^\d+$` },
    },
    {
      kind: "input",
      id: "nev",
      label: { hu: "Név" },
      visibility: { kind: "always" },
      required: false,
      price: 0,
      pattern: "^[a-z]+$",
    },
    {
      kind: "material",
      id: "anyag",
      label: { hu: "Anyag" },
      options: [{ materialId: "len", price: 0 }],
      colorCount: { kind: "fixed", count: 2 },
    },
    {
      kind: "embroidery",
      id: "hímzés",
      label: { hu: "Hímzés" },
      visibility: { kind: "always" },
      pricing: { kind: "flat", price: 500 },
    },
  ],
});

const materialColors = new Map([["len", new Set(["piros", "kek"])]]);

function reject(selections: LineSelections): string | undefined {
  return selectionsRejection({
    definition,
    productName: "Párna",
    selections,
    materialColors,
    languageCode: "hu",
  });
}

describe("selectionsRejection", () => {
  it("accepts well-formed selections", () => {
    expect(
      reject({
        meret: { kind: "custom", value: "45" },
        nev: { kind: "input", value: "anna" },
        anyag: { kind: "material", materialId: "len", colors: ["piros", "kek"] },
        hímzés: { kind: "embroidery", text: "szia", colorId: "x" },
      })
    ).toBeUndefined();
  });

  it("rejects an unknown field", () => {
    expect(reject({ x: { kind: "input", value: "" } })).toContain("nem ismeri");
  });

  it("rejects a kind that does not match the field", () => {
    expect(reject({ nev: { kind: "custom", value: "a" } })).toContain("fajtájának");
  });

  it("rejects unknown and duplicate material colours", () => {
    const pick = (colors: string[]): LineSelections => ({
      anyag: { kind: "material", materialId: "len", colors },
    });

    expect(reject(pick(["piros", "zold"]))).toContain("nem kínált színt");
    expect(reject(pick(["piros", "piros"]))).toContain("többször");
  });

  it("rejects an unknown option and a custom value breaking the pattern", () => {
    expect(reject({ meret: { kind: "option", value: "99" } })).toContain("nem kínált");
    expect(reject({ meret: { kind: "custom", value: "abc" } })).toContain("formátuma");
  });

  it("rejects over-long text", () => {
    const text = "a".repeat(MAX_SELECTION_TEXT_LENGTH + 1);

    expect(reject({ hímzés: { kind: "embroidery", text, colorId: "x" } })).toContain("legfeljebb");
    expect(reject({ nev: { kind: "input", value: text } })).toContain("legfeljebb");
  });
});

describe("referencedMaterialIds", () => {
  it("lists each referenced material once", () => {
    expect(
      referencedMaterialIds({
        a: { kind: "material", materialId: "len", colors: [] },
        b: { kind: "material", materialId: "len", colors: [] },
        c: { kind: "input", value: "" },
      })
    ).toEqual(["len"]);
  });
});

describe("validateSelections", () => {
  it("reports every problem with a structured code, not only the first", () => {
    const problems = validateSelections({
      definition,
      selections: {
        ismeretlen: { kind: "input", value: "x" },
        meret: { kind: "input", value: "x" },
        nev: { kind: "input", value: "ÁÉ" },
      },
      materialColors,
    });

    expect(problems).toEqual([
      { code: "unknown-field", fieldId: "ismeretlen" },
      { code: "wrong-kind", fieldId: "meret" },
      { code: "invalid", fieldId: "nev", reason: "bad-format", subject: "value" },
    ]);
  });

  it("formats a problem in Hungarian", () => {
    const [problem] = validateSelections({
      definition,
      selections: { nev: { kind: "input", value: "ÁÉ" } },
      materialColors,
    });

    expect(
      formatSelectionProblem(problem, { definition, productName: "Párna", languageCode: "hu" })
    ).toBe('A(z) "Párna" "Név" mezőjének választása érvénytelen: az érték formátuma érvénytelen.');
  });

  it("requires as many colours as the material field's fixed colour count", () => {
    expect(reject({ anyag: { kind: "material", materialId: "len", colors: ["piros"] } })).toContain(
      "legalább 2 színt"
    );
    expect(
      reject({ anyag: { kind: "material", materialId: "len", colors: ["piros", "kek"] } })
    ).toBeUndefined();
  });

  it("requires the colour count another field supplies, once that field is answered", () => {
    const fromField = ProductDefinitionSchema.parse({
      ...definition,
      fields: [
        {
          kind: "choice",
          id: "fonas",
          label: { hu: "Fonás" },
          presentation: "radio",
          visibility: { kind: "always" },
          options: [{ id: "2", label: { hu: "Kettő" }, price: 0 }],
        },
        {
          kind: "material",
          id: "anyag",
          label: { hu: "Anyag" },
          options: [{ materialId: "len", price: 0 }],
          colorCount: { kind: "from-field", fieldId: "fonas" },
        },
      ],
    });
    const material = {
      kind: "material",
      materialId: "len",
      colors: ["piros"],
    } satisfies LineSelectionRecord;

    expect(
      validateSelections({
        definition: fromField,
        selections: { fonas: { kind: "option", value: "2" }, anyag: material },
        materialColors,
      })
    ).toEqual([{ code: "invalid", fieldId: "anyag", reason: "too-few-colors", required: 2 }]);
    expect(
      validateSelections({ definition: fromField, selections: { anyag: material }, materialColors })
    ).toEqual([]);
  });
});
