import { describe, expect, it } from "vitest";
import { definitionTextGaps, missingTranslation, withEnAtPath } from "./gaps";

describe("missingTranslation", () => {
  it("reports a Hungarian source text without an English value", () => {
    expect(missingTranslation("Foglaló")).toBe(true);
    expect(missingTranslation("Foglaló", "")).toBe(true);
    expect(missingTranslation("Foglaló", "   ")).toBe(true);
  });

  it("skips fields without Hungarian text and translated fields", () => {
    expect(missingTranslation("", "Grid protector")).toBe(false);
    expect(missingTranslation()).toBe(false);
    expect(missingTranslation("Foglaló", "Grid protector")).toBe(false);
  });
});

describe("definitionTextGaps", () => {
  it("walks nested localized texts and reports the ones missing en", () => {
    const definition = {
      basePrice: 1000,
      fields: [
        {
          kind: "choice",
          id: "szin",
          label: { hu: "Szín" },
          options: [
            { id: "zold", label: { hu: "Zöld" } },
            { id: "kek", label: { hu: "Kék", en: "Blue" } },
          ],
        },
      ],
      note: { hu: "Válassz színt" },
    };

    expect(definitionTextGaps(definition)).toEqual([
      { path: "fields.szin.label", hu: "Szín" },
      { path: "fields.szin.options.zold.label", hu: "Zöld" },
      { path: "note", hu: "Válassz színt" },
    ]);
  });

  it("addresses id-less array items by index", () => {
    const definition = {
      fields: [
        {
          kind: "input",
          id: "felirat",
          label: { hu: "Felirat" },
          suggestions: [{ value: "pötty", label: { hu: "Pötty" } }],
        },
      ],
    };

    expect(definitionTextGaps(definition)).toEqual([
      { path: "fields.felirat.label", hu: "Felirat" },
      { path: "fields.felirat.suggestions.0.label", hu: "Pötty" },
    ]);
  });

  it("ignores non-text values and objects that are not localized texts", () => {
    const definition = {
      basePrice: 1000,
      meta: { tags: ["a", "b"], weight: 2.5 },
      name: { hu: "Rácsvédő", en: "Grid protector" },
    };

    expect(definitionTextGaps(definition)).toEqual([]);
  });
});

describe("withEnAtPath", () => {
  const definition = {
    fields: [{ id: "felirat", label: { hu: "Felirat" } }],
  };

  it("sets the language text at the path without touching the rest", () => {
    const patched = withEnAtPath(definition, "fields.felirat.label", "en", "Label");

    expect(patched.fields[0].label).toEqual({ hu: "Felirat", en: "Label" });
    expect(definition.fields[0].label).toEqual({ hu: "Felirat" });
  });

  it("resolves array segments by item id and falls back to the index", () => {
    expect(() => withEnAtPath(definition, "fields.0.label", "en", "Index")).not.toThrow();
    expect(() => withEnAtPath(definition, "fields.felirat.label", "en", "Id")).not.toThrow();
  });

  it("rejects paths that do not address a localized text", () => {
    expect(() => withEnAtPath(definition, "fields.felirat.id", "en", "Label")).toThrow();
    expect(() => withEnAtPath(definition, "fields.9.label", "en", "Label")).toThrow();
    expect(() => withEnAtPath(definition, "nope", "en", "Label")).toThrow();
  });

  it("rejects the patch when the Hungarian source changed since the listing", () => {
    expect(() => withEnAtPath(definition, "fields.felirat.label", "en", "Label", "Régi")).toThrow();
    expect(() =>
      withEnAtPath(definition, "fields.felirat.label", "en", "Label", "Felirat")
    ).not.toThrow();
  });
});
