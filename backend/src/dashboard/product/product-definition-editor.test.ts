/**
 * Unit tests for the configurator editor's pure logic (the transforms the
 * 60-second browser e2e only exercises through the UI). The canonical schema
 * is the authority these helpers must satisfy, so the assertions validate
 * against it where a shape matters.
 */
import { describe, expect, test } from "vitest";
import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import {
  applyLengthSourceDefaults,
  assignGeneratedIds,
  canUnifiedSave,
  planUnifiedSave,
  carryOver,
  generateFieldId,
  hasEditableData,
  isLengthSourceField,
  lengthSourceCandidates,
  lengthSourceValueErrors,
  loadBearingFieldIds,
  newDefinition,
  newField,
  pricingMode,
  sanitize,
  slugifyLabel,
  summaryChips,
  textPlaceholder,
  textValue,
  withColorCountMode,
  withCustomValue,
  withPricingMode,
  withText,
  withVisibility,
  type ChoiceFieldInput,
  type ChoiceOptionInput,
  type InputFieldInput,
  type MaterialFieldInput,
  type ToggleFieldInput,
} from "./product-definition-editor";

const sampleChoice = (id: string, label: string, optionIds: string[]): ChoiceFieldInput => ({
  id,
  label: { hu: label },
  kind: "choice",
  presentation: "select",
  visibility: { kind: "always" },
  options: optionIds.map((optionId) => ({ id: optionId, label: { hu: optionId }, price: 0 })),
});

const sampleInput = (id: string, label: string): InputFieldInput => ({
  id,
  label: { hu: label },
  kind: "input",
  visibility: { kind: "always" },
  required: true,
  price: 0,
});

const sampleToggle = (id: string, label: string): ToggleFieldInput => ({
  id,
  label: { hu: label },
  kind: "toggle",
  visibility: { kind: "always" },
  price: 0,
});

const sampleMaterial = (id: string, label: string): MaterialFieldInput => ({
  id,
  label: { hu: label },
  kind: "material",
  options: [{ materialId: `${id}-pamut`, price: 0 }],
  colorCount: { kind: "fixed", count: 1 },
});

describe("newField", () => {
  test("choice fields default to a select with one empty option", () => {
    const field = newField("choice", "szin", { hu: "Szín" });

    expect(field).toEqual({
      id: "szin",
      label: { hu: "Szín" },
      kind: "choice",
      presentation: "select",
      visibility: { kind: "always" },
      options: [{ id: "", label: { hu: "" }, price: 0 }],
    });
  });

  test("every kind starts from its canonical defaults", () => {
    expect(newField("toggle", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "toggle",
      visibility: { kind: "always" },
      price: 0,
    });
    expect(newField("material", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "material",
      options: [],
      colorCount: { kind: "fixed", count: 1 },
    });
    expect(newField("input", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "input",
      visibility: { kind: "always" },
      required: true,
      price: 0,
    });
    expect(newField("embroidery", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "embroidery",
      visibility: { kind: "always" },
      pricing: { kind: "per-word", pricePerWord: 0 },
    });
  });
});

describe("hasEditableData", () => {
  test("a fresh row is bare defaults regardless of kind", () => {
    for (const kind of ["choice", "toggle", "material", "input", "embroidery"] as const) {
      expect(hasEditableData(newField(kind, "", { hu: "" }))).toBe(false);
    }
  });

  test("id and label alone are not editable data — they survive a kind switch", () => {
    expect(hasEditableData(newField("choice", "szin", { hu: "Szín" }))).toBe(false);
  });

  test("any edited value counts as data a kind switch would discard", () => {
    const pricedOption = newField("choice", "", { hu: "" });

    if (pricedOption.kind === "choice") {
      pricedOption.options[0].price = 500;
      expect(hasEditableData(pricedOption)).toBe(true);
    }

    const optionalInput = newField("input", "", { hu: "" });

    if (optionalInput.kind === "input") {
      optionalInput.required = false;
      expect(hasEditableData(optionalInput)).toBe(true);
    }

    const extraMaterial = newField("material", "", { hu: "" });

    if (extraMaterial.kind === "material") {
      extraMaterial.options.push({ materialId: "e2e-pamut", price: 0 });
      expect(hasEditableData(extraMaterial)).toBe(true);
    }
  });
});

describe("carryOver", () => {
  test("passes tooltip and visibility across a non-material switch", () => {
    const previous = newField("choice", "szin", { hu: "Szín" });

    if (previous.kind === "choice") {
      previous.tooltip = { hu: "Válassz színt" };
      previous.visibility = { kind: "when-present", fieldId: "ajandek" };
    }

    const next = carryOver(newField("toggle", "szin", { hu: "Szín" }), previous);

    expect(next.kind).toBe("toggle");
    expect(next.tooltip).toEqual({ hu: "Válassz színt" });

    if (next.kind === "toggle") {
      expect(next.visibility).toEqual({ kind: "when-present", fieldId: "ajandek" });
    }
  });

  test("a material target keeps its own (empty) tooltip and visibility", () => {
    const previous = newField("toggle", "a", { hu: "A" });
    previous.tooltip = { hu: "Kapcsold be" };

    const next = carryOver(newField("material", "a", { hu: "A" }), previous);

    expect(next).toEqual(newField("material", "a", { hu: "A" }));
  });

  test("switching from a material keeps the target's own visibility", () => {
    const next = carryOver(
      newField("input", "a", { hu: "A" }),
      newField("material", "a", { hu: "A" })
    );

    if (next.kind === "input") {
      expect(next.visibility).toEqual({ kind: "always" });
    }
  });
});

describe("sanitize", () => {
  test("trims ids, labels, material references and forbidden pairs", () => {
    const definition = newDefinition("  e2e-x  ");
    definition.fields = [
      newField("choice", " szin ", { hu: " Szín " }),
      newField("material", " anyag ", { hu: " Anyag " }),
    ];

    const choice = definition.fields[0];
    if (choice.kind === "choice") {
      choice.options = [{ id: " kek ", label: { hu: " Kék " }, price: 0 }];
    }

    const material = definition.fields[1];
    if (material.kind === "material") {
      material.options = [{ materialId: " e2e-pamut ", price: 0 }];
    }

    definition.forbiddenMaterialCombinations = [[" e2e-pamut ", " e2e-vaszon "]];

    const cleaned = sanitize(definition);

    expect(cleaned.fields[0].id).toBe("szin");
    expect(cleaned.fields[0].label).toEqual({ hu: "Szín" });

    if (cleaned.fields[0].kind === "choice") {
      expect(cleaned.fields[0].options[0]).toEqual({ id: "kek", label: { hu: "Kék" }, price: 0 });
    }

    if (cleaned.fields[1].kind === "material") {
      expect(cleaned.fields[1].options[0]).toEqual({ materialId: "e2e-pamut", price: 0 });
    }

    expect(cleaned.forbiddenMaterialCombinations).toEqual([["e2e-pamut", "e2e-vaszon"]]);
  });

  test("a sanitized fresh definition passes the canonical schema", () => {
    const definition = sanitize(newDefinition("e2e-x"));

    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(true);
  });

  test("trims the new editable strings", () => {
    const definition = newDefinition("p");

    const choice = sampleChoice(" szin ", " Szín ", []);
    choice.options = [
      { id: " kek ", label: { hu: " Kék " }, price: 0, tooltip: { hu: " Sötét " } },
    ];
    choice.tooltip = { hu: " Válassz " };
    choice.customValue = {
      pattern: String.raw` ^\d+$ `,
      placeholder: { hu: " Egyéb ", en: " Other " },
    };

    const input = sampleInput(" nev ", " Név ");
    input.tooltip = { hu: " Írd ide " };
    input.placeholder = { hu: " Pl. Anna " };
    input.pattern = " ^[A-Z] ";
    input.suggestions = [{ value: " Anna ", label: { hu: " Anna " } }];

    definition.fields = [choice, input];

    const cleaned = sanitize(definition);
    const cleanedChoice = cleaned.fields[0];

    if (cleanedChoice.kind !== "choice") {
      throw new Error("expected a choice field");
    }

    expect(cleanedChoice.tooltip).toEqual({ hu: "Válassz" });
    expect(cleanedChoice.options[0].tooltip).toEqual({ hu: "Sötét" });
    expect(cleanedChoice.customValue).toEqual({
      pattern: String.raw`^\d+$`,
      placeholder: { hu: "Egyéb", en: "Other" },
    });

    const cleanedInput = cleaned.fields[1];

    if (cleanedInput.kind !== "input") {
      throw new Error("expected an input field");
    }

    expect(cleanedInput.tooltip).toEqual({ hu: "Írd ide" });
    expect(cleanedInput.placeholder).toEqual({ hu: "Pl. Anna" });
    expect(cleanedInput.pattern).toBe("^[A-Z]");
    expect(cleanedInput.suggestions).toEqual([{ value: "Anna", label: { hu: "Anna" } }]);

    expect(ProductDefinitionSchema.safeParse(cleaned).success).toBe(true);
  });

  test("a sparse customValue keeps only the keys it has", () => {
    const definition = newDefinition("p");

    const choice = sampleChoice("szin", "Szín", ["kek"]);
    choice.customValue = { pattern: String.raw` ^\d+$ ` };

    definition.fields = [choice];

    const cleaned = sanitize(definition);
    const cleanedChoice = cleaned.fields[0];

    if (cleanedChoice.kind !== "choice") {
      throw new Error("expected a choice field");
    }

    expect(cleanedChoice.customValue).toStrictEqual({ pattern: String.raw`^\d+$` });
  });
});

describe("newDefinition", () => {
  test("starts orderable, unit-priced and empty", () => {
    expect(newDefinition("e2e-x")).toEqual({
      id: "e2e-x",
      orderable: true,
      basePrice: 0,
      pricing: { kind: "unit" },
      fields: [],
      forbiddenMaterialCombinations: [],
    });
  });
});

describe("slugifyLabel", () => {
  test.each([
    ["Szín", "szin"],
    ["Méret (cm)", "meret-cm"],
    ["Ajándék csomagolás", "ajandek-csomagolas"],
    ["  -", ""],
  ])("%j → %j", (label, expected) => {
    expect(slugifyLabel(label)).toBe(expected);
  });
});

describe("assignGeneratedIds", () => {
  const choiceField = (
    id: string,
    label: string,
    options: ChoiceOptionInput[]
  ): ChoiceFieldInput => ({
    id,
    label: { hu: label },
    kind: "choice",
    presentation: "select",
    visibility: { kind: "always" },
    options,
  });

  test("derives field and option codes from the labels", () => {
    const definition = assignGeneratedIds({
      ...newDefinition("p"),
      fields: [
        choiceField("", "Szín", [
          { id: "", label: { hu: "Kék" }, price: 0 },
          { id: "", label: { hu: "Piros" }, price: 0 },
        ]),
        newField("toggle", "", { hu: "Ajándék csomagolás" }),
      ],
    });

    expect(definition.fields.map((field) => field.id)).toEqual(["szin", "ajandek-csomagolas"]);
    const choice = definition.fields[0];
    if (choice.kind !== "choice") {
      throw new Error("expected the first field to stay a choice");
    }

    expect(choice.options.map((option) => option.id)).toEqual(["kek", "piros"]);
  });

  test("deduplicates generated codes and keeps explicit ones untouched", () => {
    const definition = assignGeneratedIds({
      ...newDefinition("p"),
      fields: [
        newField("toggle", "meret", { hu: "Első" }),
        newField("toggle", "", { hu: "Méret" }),
        newField("toggle", "", { hu: "Méret" }),
        choiceField("szin", "Szín", [
          { id: "kek", label: { hu: "Kék" }, price: 0 },
          { id: "", label: { hu: "Kék" }, price: 0 },
          { id: "", label: { hu: "" }, price: 0 },
        ]),
      ],
    });

    expect(definition.fields.map((field) => field.id)).toEqual([
      "meret",
      "meret-2",
      "meret-3",
      "szin",
    ]);
    const choice = definition.fields[3];
    if (choice.kind !== "choice") {
      throw new Error("expected the fourth field to stay a choice");
    }

    expect(choice.options.map((option) => option.id)).toEqual(["kek", "kek-2", "opcio"]);
  });

  test("the output still satisfies the canonical schema", () => {
    const definition = assignGeneratedIds(
      sanitize({
        ...newDefinition("p"),
        fields: [choiceField("", "Szín", [{ id: "", label: { hu: "Kék" }, price: 0 }])],
      })
    );

    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(true);
  });
});

describe("text helpers", () => {
  test("a non-default language edits its own entry and shows hu as placeholder", () => {
    const text = withText({ hu: "Méret" }, "en", "Size");

    expect(text).toEqual({ hu: "Méret", en: "Size" });
    expect(textValue(text, "en")).toBe("Size");
    expect(textPlaceholder({ hu: "Méret" }, "en")).toBe("Méret");
    expect(textPlaceholder(text, "en")).toBeUndefined();
    expect(textPlaceholder({ hu: "Méret" }, "hu")).toBeUndefined();
  });

  test("emptying a non-default language removes it, hu stays", () => {
    expect(withText({ hu: "Méret", en: "Size" }, "en", "")).toEqual({ hu: "Méret" });
    expect(withText({ hu: "Méret" }, "hu", "")).toEqual({ hu: "" });
  });
});

describe("planUnifiedSave", () => {
  test("saves only the page form when only it is dirty", () => {
    const state = { pageDirty: true, pageValid: true, configuratorDirty: false };

    expect(planUnifiedSave(state)).toEqual({ savePage: true, saveConfigurator: false });
  });

  test("saves both when both are dirty", () => {
    const state = { pageDirty: true, pageValid: true, configuratorDirty: true };

    expect(planUnifiedSave(state)).toEqual({ savePage: true, saveConfigurator: true });
  });

  test("an invalid dirty page does not block the configurator", () => {
    const state = { pageDirty: true, pageValid: false, configuratorDirty: true };

    expect(planUnifiedSave(state)).toEqual({ savePage: false, saveConfigurator: true });
  });

  test("is disabled when nothing is saveable", () => {
    expect(canUnifiedSave({ pageDirty: false, pageValid: true, configuratorDirty: false })).toBe(
      false
    );
    expect(canUnifiedSave({ pageDirty: true, pageValid: false, configuratorDirty: false })).toBe(
      false
    );
  });
});

describe("pricing mode", () => {
  test("unit is the default and carries no source field", () => {
    const definition = newDefinition("p");

    expect(pricingMode(definition)).toBe("unit");
    expect(withPricingMode(definition, "unit")).toEqual(definition);
  });

  test("an explicit source field wins, even against the candidate order", () => {
    const definition = {
      ...newDefinition("p"),
      fields: [sampleInput("hossz", "Hossz"), sampleChoice("szin", "Szín", ["kek"])],
    };

    expect(withPricingMode(definition, "length", "szin").pricing).toEqual({
      kind: "length",
      sourceFieldId: "szin",
    });
    expect(pricingMode(withPricingMode(definition, "length", "szin"))).toBe("length");
  });

  test("without an explicit id the current source, else the first candidate, is kept", () => {
    const definition = {
      ...newDefinition("p"),
      fields: [sampleToggle("kapcsolo", "Kapcsoló"), sampleInput("hossz", "Hossz")],
    };

    expect(withPricingMode(definition, "length").pricing).toEqual({
      kind: "length",
      sourceFieldId: "hossz",
    });
    expect(withPricingMode(withPricingMode(definition, "length"), "length").pricing).toEqual({
      kind: "length",
      sourceFieldId: "hossz",
    });
  });

  test("with no candidate field the source starts blank", () => {
    expect(withPricingMode(newDefinition("p"), "length").pricing).toEqual({
      kind: "length",
      sourceFieldId: "",
    });
  });

  test("a unit round-trip forgets the source and falls back to the first candidate", () => {
    const definition = withPricingMode(
      { ...newDefinition("p"), fields: [sampleInput("hossz", "Hossz")] },
      "length",
      "szin"
    );

    expect(withPricingMode(withPricingMode(definition, "unit"), "length").pricing).toEqual({
      kind: "length",
      sourceFieldId: "hossz",
    });
  });
});

describe("lengthSourceCandidates", () => {
  test("only named input and choice fields are string-valued candidates", () => {
    const definition = {
      ...newDefinition("p"),
      fields: [
        sampleToggle("kapcsolo", "Kapcsoló"),
        sampleInput("hossz", "Hossz"),
        sampleMaterial("anyag", "Anyag"),
        sampleChoice("szin", "Szín", ["kek"]),
        newField("embroidery", "himzes", { hu: "Hímzés" }),
        newField("input", "", { hu: "Névtelen" }),
      ],
    };

    expect(lengthSourceCandidates(definition).map((field) => field.id)).toEqual(["hossz", "szin"]);
  });
});

describe("generateFieldId", () => {
  test("slugs the Hungarian label, dedupes against used ids, falls back to mezo", () => {
    const used = new Set(["meret"]);

    expect(generateFieldId({ hu: " Méret " }, used)).toBe("meret-2");
    expect(generateFieldId({ hu: "Szín" }, used)).toBe("szin");
    expect(generateFieldId({ hu: "   " }, used)).toBe("mezo");
  });
});

describe("isLengthSourceField", () => {
  test("true only for the length pricing's own source field", () => {
    const definition = withPricingMode(
      {
        ...newDefinition("p"),
        fields: [sampleInput("hossz", "Hossz"), sampleInput("szelesseg", "Szélesség")],
      },
      "length",
      "hossz"
    );

    expect(isLengthSourceField(definition, "hossz")).toBe(true);
    expect(isLengthSourceField(definition, "szelesseg")).toBe(false);
    expect(isLengthSourceField(newDefinition("p"), "hossz")).toBe(false);
  });
});

describe("loadBearingFieldIds", () => {
  test("unions the length source, visibility subjects and colorCount sources", () => {
    const choice = sampleChoice("szin", "Szín", ["kek"]);
    choice.visibility = { kind: "when-equal", fieldId: "kapcsolo", value: "igen" };

    const toggle = sampleToggle("kapcsolo", "Kapcsoló");
    toggle.visibility = { kind: "when-present", fieldId: "szin" };

    const material = sampleMaterial("anyag", "Anyag");
    material.colorCount = { kind: "from-field", fieldId: "hossz" };

    const definition = {
      ...withPricingMode(newDefinition("p"), "length", "hossz"),
      fields: [choice, toggle, material, sampleInput("magaban", "Magában")],
    };

    expect(loadBearingFieldIds(definition)).toEqual(new Set(["szin", "kapcsolo", "hossz"]));
  });

  test("unit pricing contributes no length source", () => {
    const material = sampleMaterial("anyag", "Anyag");
    material.colorCount = { kind: "from-field", fieldId: "hossz" };

    expect(loadBearingFieldIds({ ...newDefinition("p"), fields: [material] })).toEqual(
      new Set(["hossz"])
    );
  });
});

describe("applyLengthSourceDefaults", () => {
  test("an input source gets the digits-only pattern only when it has none", () => {
    const bare = { ...newDefinition("p"), fields: [sampleInput("hossz", "Hossz")] };
    const defaulted = applyLengthSourceDefaults(bare, "hossz");
    const field = defaulted.fields[0];

    if (field.kind !== "input") {
      throw new Error("expected an input field");
    }

    expect(field.pattern).toBe(String.raw`^\d+$`);

    const custom = { ...bare, fields: [{ ...sampleInput("hossz", "Hossz"), pattern: "^[0-9]+$" }] };

    expect(applyLengthSourceDefaults(custom, "hossz").fields[0]).toEqual(custom.fields[0]);
  });

  test("a choice source fills only an existing customValue's missing pattern", () => {
    const choice = sampleChoice("hossz", "Hossz", ["250"]);
    const bare = { ...newDefinition("p"), fields: [choice] };

    const plain = applyLengthSourceDefaults(bare, "hossz").fields[0];

    if (plain.kind !== "choice") {
      throw new Error("expected a choice field");
    }

    expect(plain.customValue).toBeUndefined();

    const withCustom = {
      ...bare,
      fields: [{ ...choice, customValue: { placeholder: { hu: "Egyéb" } } }],
    };
    const filled = applyLengthSourceDefaults(withCustom, "hossz").fields[0];

    if (filled.kind !== "choice") {
      throw new Error("expected a choice field");
    }

    expect(filled.customValue).toEqual({
      placeholder: { hu: "Egyéb" },
      pattern: String.raw`^\d+$`,
    });

    const withPattern = { ...bare, fields: [{ ...choice, customValue: { pattern: "^[0-9]+$" } }] };

    expect(applyLengthSourceDefaults(withPattern, "hossz").fields[0]).toEqual(
      withPattern.fields[0]
    );
  });

  test("other kinds and other fields are untouched", () => {
    const definition = {
      ...newDefinition("p"),
      fields: [sampleToggle("hossz", "Hossz"), sampleInput("masik", "Másik")],
    };

    expect(applyLengthSourceDefaults(definition, "hossz").fields).toEqual([
      sampleToggle("hossz", "Hossz"),
      sampleInput("masik", "Másik"),
    ]);
  });
});

describe("lengthSourceValueErrors", () => {
  test("a unit-priced product has none", () => {
    expect(lengthSourceValueErrors(newDefinition("p"))).toEqual([]);
  });

  test("a missing or non-choice source has no option errors", () => {
    const inputSource = withPricingMode(
      { ...newDefinition("p"), fields: [sampleInput("hossz", "Hossz")] },
      "length",
      "hossz"
    );

    expect(lengthSourceValueErrors(inputSource)).toEqual([]);

    const missingSource = withPricingMode(newDefinition("p"), "length", "nincs");

    expect(lengthSourceValueErrors(missingSource)).toEqual([]);
  });

  test("option codes must be numeric, 1..10000 cm and unique", () => {
    const source = sampleChoice("hossz", "Hossz", ["10", "250", "abc", "0", "10001", "250"]);
    source.options[5].label = { hu: "még egy" };
    const definition = withPricingMode(
      { ...newDefinition("p"), fields: [source] },
      "length",
      "hossz"
    );

    expect(lengthSourceValueErrors(definition)).toEqual([
      {
        fieldId: "hossz",
        message: 'A(z) "Hossz" méteráras forrásmező "abc" opciókódja nem szám (cm).',
      },
      {
        fieldId: "hossz",
        message:
          'A(z) "Hossz" méteráras forrásmező "0" opciókódja 1 és 10000 közé eső egész szám (cm) lehet — 10000 cm = 100 m.',
      },
      {
        fieldId: "hossz",
        message:
          'A(z) "Hossz" méteráras forrásmező "10001" opciókódja 1 és 10000 közé eső egész szám (cm) lehet — 10000 cm = 100 m.',
      },
      { fieldId: "hossz", message: 'hossz: duplikált opciókód: "250".' },
    ]);
  });

  test("an unlabeled source is named by its id", () => {
    const source = sampleChoice("hossz", "", ["abc"]);
    const definition = withPricingMode(
      { ...newDefinition("p"), fields: [source] },
      "length",
      "hossz"
    );

    expect(lengthSourceValueErrors(definition)).toEqual([
      {
        fieldId: "hossz",
        message: 'A(z) "hossz" méteráras forrásmező "abc" opciókódja nem szám (cm).',
      },
    ]);
  });

  test("in-range numeric codes pass", () => {
    const source = sampleChoice("hossz", "Hossz", ["1", "10000"]);
    const definition = withPricingMode(
      { ...newDefinition("p"), fields: [source] },
      "length",
      "hossz"
    );

    expect(lengthSourceValueErrors(definition)).toEqual([]);
  });
});

describe("withCustomValue", () => {
  test("enabling starts empty and preserves a given previous value", () => {
    const field = sampleChoice("szin", "Szín", ["kek"]);
    const previous = { pattern: String.raw`^\d+$`, placeholder: { hu: "Egyéb" } };

    expect(withCustomValue(field, true).customValue).toEqual({});
    expect(withCustomValue(field, true, previous).customValue).toEqual(previous);
  });

  test("re-enabling keeps the custom value the field already had", () => {
    const field = {
      ...sampleChoice("szin", "Szín", ["kek"]),
      customValue: { pattern: String.raw`^\d+$` },
    };

    expect(withCustomValue(field, true).customValue).toEqual({ pattern: String.raw`^\d+$` });
  });

  test("disabling removes the key entirely", () => {
    const field = {
      ...sampleChoice("szin", "Szín", ["kek"]),
      customValue: { pattern: String.raw`^\d+$` },
    };

    const disabled = withCustomValue(field, false);

    expect(Object.hasOwn(disabled, "customValue")).toBe(false);
    expect(disabled).toStrictEqual(sampleChoice("szin", "Szín", ["kek"]));
  });
});

describe("withColorCountMode", () => {
  test("fixed keeps the existing count or starts from 1", () => {
    const counted = sampleMaterial("anyag", "Anyag");
    counted.colorCount = { kind: "fixed", count: 3 };

    expect(withColorCountMode(counted, "fixed").colorCount).toEqual({ kind: "fixed", count: 3 });

    const sourced = sampleMaterial("anyag", "Anyag");
    sourced.colorCount = { kind: "from-field", fieldId: "hossz" };

    expect(withColorCountMode(sourced, "fixed").colorCount).toEqual({ kind: "fixed", count: 1 });
  });

  test("from-field takes the given field id", () => {
    const field = sampleMaterial("anyag", "Anyag");

    expect(withColorCountMode(field, "from-field", "hossz").colorCount).toEqual({
      kind: "from-field",
      fieldId: "hossz",
    });
    expect(withColorCountMode(field, "from-field").colorCount).toEqual({
      kind: "from-field",
      fieldId: "",
    });
  });
});

describe("withVisibility", () => {
  test("sets the rule and keeps the tooltip", () => {
    const field = sampleToggle("kapcsolo", "Kapcsoló");
    field.tooltip = { hu: "Kapcsold be" };

    const updated = withVisibility(field, { kind: "when-present", fieldId: "szin" });

    expect(updated).toEqual({
      ...field,
      visibility: { kind: "when-present", fieldId: "szin" },
    });
  });

  test("material fields have no visibility — the call is a no-op", () => {
    const field = sampleMaterial("anyag", "Anyag");
    field.tooltip = { hu: "Válassz anyagot" };

    const updated = withVisibility(field, { kind: "when-present", fieldId: "szin" });

    expect(updated).toBe(field);
    expect(Object.hasOwn(updated, "visibility")).toBe(false);
  });
});

test("trims embroidery placeholder and pattern", () => {
  const definition = newDefinition("p");

  const field = newField("embroidery", " himzes ", { hu: " Hímzés " });

  if (field.kind !== "embroidery") {
    throw new Error("expected an embroidery field");
  }

  field.placeholder = { hu: " Pl. Boglárka " };
  field.pattern = " ^[A-Z] ";
  definition.fields = [field];

  const cleaned = sanitize(definition);
  const cleanedEmbroidery = cleaned.fields[0];

  if (cleanedEmbroidery.kind !== "embroidery") {
    throw new Error("expected an embroidery field");
  }

  expect(cleanedEmbroidery.id).toBe("himzes");
  expect(cleanedEmbroidery.placeholder).toEqual({ hu: "Pl. Boglárka" });
  expect(cleanedEmbroidery.pattern).toBe("^[A-Z]");
  expect(ProductDefinitionSchema.safeParse(cleaned).success).toBe(true);
});

describe("summaryChips", () => {
  test("choice chips count options and flag custom values", () => {
    const field = sampleChoice("szin", "Szín", ["kek", "piros"]);

    expect(summaryChips(field)).toEqual(["2 opció"]);

    field.customValue = { pattern: String.raw`^\d+$` };

    expect(summaryChips(field)).toEqual(["2 opció", "egyéni érték"]);
  });

  test("input chips flag requiredness and suggestions", () => {
    const field = sampleInput("nev", "Név");

    expect(summaryChips(field)).toEqual(["kötelező"]);

    field.required = false;

    expect(summaryChips(field)).toEqual([]);

    field.suggestions = [{ value: "Anna", label: { hu: "Anna" } }];

    expect(summaryChips(field)).toEqual(["javaslatok"]);
  });

  test("toggle chips show its price", () => {
    const field = sampleToggle("kapcsolo", "Kapcsoló");
    field.price = 500;

    expect(summaryChips(field)).toEqual(["kapcsoló ár: 500 Ft"]);
  });

  test("material chips count options and describe the colorCount mode", () => {
    const field = sampleMaterial("anyag", "Anyag");
    field.options = [
      { materialId: "pamut", price: 0 },
      { materialId: "vaszon", price: 0 },
    ];
    field.colorCount = { kind: "fixed", count: 3 };

    expect(summaryChips(field)).toEqual(["2 anyag", "3 szín"]);

    field.colorCount = { kind: "from-field", fieldId: "hossz" };

    expect(summaryChips(field)).toEqual(["2 anyag", "színszám mezőből"]);
  });

  test("embroidery chips show the pricing mode", () => {
    const field = newField("embroidery", "himzes", { hu: "Hímzés" });

    if (field.kind !== "embroidery") {
      throw new Error("expected an embroidery field");
    }

    expect(summaryChips(field)).toEqual(["szavanként"]);

    field.pricing = { kind: "flat", price: 1000 };

    expect(summaryChips(field)).toEqual(["egyszeri"]);
  });
});
