import { ProductDefinitionSchema } from "../product-definition/index";
import { describe, expect, it } from "vitest";
import type { LineSelectionRecord, LineSelections } from "../product-definition/index";
import type { Refusal } from "../refusal";
import {
  MAX_SELECTION_TEXT_LENGTH,
  referencedMaterialIds,
  selectionRefusal,
  selectionsRejection,
  validateSelections,
} from "./selection-validation";

const definition = ProductDefinitionSchema.parse({
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

function reject(selections: LineSelections): Refusal | undefined {
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
    expect(reject({ x: { kind: "input", value: "" } })).toEqual({
      code: "UNKNOWN_FIELD",
      productName: "Párna",
      fieldId: "x",
    });
  });

  it("rejects a kind that does not match the field", () => {
    expect(reject({ nev: { kind: "custom", value: "a" } })).toEqual({
      code: "SELECTION_WRONG_KIND",
      productName: "Párna",
      fieldLabel: "Név",
    });
  });

  it("rejects a foreign material colour and accepts a repeated one", () => {
    const pick = (colors: string[]): LineSelections => ({
      anyag: { kind: "material", materialId: "len", colors },
    });

    expect(reject(pick(["piros", "zold"]))).toMatchObject({ reason: { code: "FOREIGN_COLOR" } });
    // The same colour twice is a legitimate pick (e.g. Teddy/Velúr items use
    // one colour for two parts); only a colour the material does not offer is
    // rejected.
    expect(reject(pick(["piros", "piros"]))).toBeUndefined();
  });

  it("rejects an unknown option and a custom value breaking the pattern", () => {
    expect(reject({ meret: { kind: "option", value: "99" } })).toMatchObject({
      reason: { code: "UNOFFERED_VALUE" },
    });
    expect(reject({ meret: { kind: "custom", value: "abc" } })).toMatchObject({
      reason: { code: "BAD_FORMAT", subject: "value" },
    });
  });

  it("rejects over-long text", () => {
    const text = "a".repeat(MAX_SELECTION_TEXT_LENGTH + 1);

    expect(reject({ hímzés: { kind: "embroidery", text, colorId: "x" } })).toMatchObject({
      reason: { code: "TEXT_TOO_LONG", subject: "text", maxLength: MAX_SELECTION_TEXT_LENGTH },
    });
    expect(reject({ nev: { kind: "input", value: text } })).toMatchObject({
      reason: { code: "TEXT_TOO_LONG", subject: "value" },
    });
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

  it("turns a problem into a refusal naming the field in the request language", () => {
    const [problem] = validateSelections({
      definition,
      selections: { nev: { kind: "input", value: "ÁÉ" } },
      materialColors,
    });

    expect(
      selectionRefusal(problem, { definition, productName: "Párna", languageCode: "hu" })
    ).toEqual({
      code: "SELECTION_INVALID",
      productName: "Párna",
      fieldLabel: "Név",
      reason: { code: "BAD_FORMAT", subject: "value" },
    });
  });

  it("requires as many colours as the material field's fixed colour count", () => {
    expect(
      reject({ anyag: { kind: "material", materialId: "len", colors: ["piros"] } })
    ).toMatchObject({ reason: { code: "TOO_FEW_COLORS", required: 2 } });
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

describe("forbidden material combinations", () => {
  const twoFields = ProductDefinitionSchema.parse({
    id: "feszek",
    basePrice: 9000,
    pricing: { kind: "unit" },
    forbiddenMaterialCombinations: [["wellsoft", "wellsoft"]],
    fields: ["kulso", "belso"].map((id) => ({
      kind: "material",
      id,
      label: { hu: id },
      options: [
        { materialId: "wellsoft", price: 0 },
        { materialId: "pamut", price: 0 },
      ],
      colorCount: { kind: "fixed", count: 1 },
    })),
  });

  function rejectPicks(selections: LineSelections): Refusal | undefined {
    return selectionsRejection({
      definition: twoFields,
      productName: "Fészek",
      selections,
      materialColors: new Map([
        ["wellsoft", new Set(["piros"])],
        ["pamut", new Set(["piros"])],
      ]),
      languageCode: "hu",
    });
  }

  it("refuses picks that complete a forbidden combination, defaults included", () => {
    expect(
      rejectPicks({
        kulso: { kind: "material", materialId: "wellsoft", colors: ["piros"] },
        belso: { kind: "material", materialId: "wellsoft", colors: ["piros"] },
      })
    ).toEqual({
      code: "FORBIDDEN_COMBINATION",
      productName: "Fészek",
      materialIds: ["wellsoft", "wellsoft"],
    });
    expect(rejectPicks({})).toMatchObject({ code: "FORBIDDEN_COMBINATION" });
  });

  it("accepts picks that complete no forbidden combination", () => {
    expect(
      rejectPicks({
        kulso: { kind: "material", materialId: "wellsoft", colors: ["piros"] },
        belso: { kind: "material", materialId: "pamut", colors: ["piros"] },
      })
    ).toBeUndefined();
  });
});
