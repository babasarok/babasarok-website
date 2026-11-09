import { describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "./catalog-snapshot";
import { translatableStrings } from "./translatable-strings";
import { planUpload, UploadPlanError, type TranslationFile } from "./upload-plan";
import { verificationProblems } from "./verify-upload";

function snapshot(overrides: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    products: [
      {
        id: "7",
        translations: [{ languageCode: "hu", name: "Párna", slug: "parna", description: "Puha" }],
      },
    ],
    materials: [
      {
        id: "3",
        slug: "minky",
        translations: [{ languageCode: "hu", label: "Minky", subtitle: "Pihe", description: null }],
        colors: [
          {
            id: "piros",
            hex: "#f00",
            asset: null,
            translations: [{ languageCode: "hu", label: "Piros" }],
          },
          {
            id: "kek",
            hex: "#00f",
            asset: { id: "9" },
            translations: [{ languageCode: "hu", label: "Kék" }],
          },
        ],
        thumbnail: null,
      },
    ],
    facets: [
      {
        id: "1",
        code: "babasarok-product-type",
        translations: [{ languageCode: "hu", name: "Terméktípus" }],
        values: [
          { id: "11", code: "parna", translations: [{ languageCode: "hu", name: "Párna" }] },
        ],
      },
    ],
    collections: [
      {
        id: "5",
        translations: [
          { languageCode: "hu", name: "Ovis felszerelés", slug: "ovis", description: "" },
        ],
      },
    ],
    promotions: [],
    shippingMethods: [],
    productDefinitions: [
      {
        productId: "parna",
        definition: {
          fields: [{ id: "meret", label: { hu: "Méret" }, options: [{ label: { hu: "Kicsi" } }] }],
        },
      },
    ],
    ...overrides,
  };
}

function file(strings: TranslationFile["strings"]): TranslationFile {
  return { language: "de", strings };
}

function refusal(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof UploadPlanError) {
      return error.problems;
    }

    throw error;
  }

  throw new Error("the plan was not refused");
}

describe("planUpload", () => {
  it("adds the language next to Hungarian, copying the slug onto a new product row", () => {
    const plan = planUpload(
      snapshot(),
      file([{ key: "product|7|name", source: "Párna", translation: "Kissen" }])
    );

    expect(plan.operations).toEqual([
      expect.objectContaining({
        mutation: "updateProduct",
        variables: {
          input: {
            id: "7",
            translations: [
              { languageCode: "hu", name: "Párna", slug: "parna", description: "Puha" },
              { languageCode: "de", name: "Kissen", slug: "parna", description: "" },
            ],
          },
        },
      }),
    ]);
  });

  it("sends the entity's custom fields back unchanged, relations already as ids", () => {
    const live = snapshot({
      products: [
        {
          id: "7",
          translations: [{ languageCode: "hu", name: "Párna", slug: "parna", description: "Puha" }],
          customFields: { date: "2026-01-05T10:00:00.000Z", iconId: "5", popularityRank: 7 },
        },
      ],
      facets: [
        {
          id: "1",
          code: "babasarok-product-type",
          translations: [{ languageCode: "hu", name: "Terméktípus" }],
          values: [
            {
              id: "11",
              code: "parna",
              translations: [{ languageCode: "hu", name: "Párna" }],
              customFields: { hex: "#9caf88", swatchId: "5" },
            },
          ],
        },
      ],
      shippingMethods: [
        {
          id: "9",
          code: "gls",
          translations: [{ languageCode: "hu", name: "GLS", description: "Házhoz" }],
          customFields: { requiresAddress: true },
        },
      ],
    });

    const plan = planUpload(
      live,
      file([
        { key: "product|7|name", source: "Párna", translation: "Kissen" },
        {
          key: "facetValue|babasarok-product-type/11|name",
          source: "Párna",
          translation: "Kissen",
        },
        { key: "shippingMethod|gls|name", source: "GLS", translation: "GLS" },
      ])
    );

    expect(plan.operations).toEqual([
      expect.objectContaining({
        mutation: "updateProduct",
        variables: {
          input: {
            id: "7",
            customFields: { date: "2026-01-05T10:00:00.000Z", iconId: "5", popularityRank: 7 },
            translations: [
              { languageCode: "hu", name: "Párna", slug: "parna", description: "Puha" },
              { languageCode: "de", name: "Kissen", slug: "parna", description: "" },
            ],
          },
        },
      }),
      expect.objectContaining({
        mutation: "updateFacetValue",
        variables: {
          input: {
            id: "11",
            customFields: { hex: "#9caf88", swatchId: "5" },
            translations: [
              { languageCode: "hu", name: "Párna" },
              { languageCode: "de", name: "Kissen" },
            ],
          },
        },
      }),
      expect.objectContaining({
        mutation: "updateShippingMethod",
        variables: {
          input: {
            id: "9",
            customFields: { requiresAddress: true },
            translations: [
              { languageCode: "hu", name: "GLS", description: "Házhoz" },
              { languageCode: "de", name: "GLS", description: "" },
            ],
          },
        },
      }),
    ]);
  });

  it("carries the Hungarian translation's custom fields on its re-sent row", () => {
    const live = snapshot();
    live.products[0]?.translations.splice(0, 1, {
      languageCode: "hu",
      name: "Párna",
      slug: "parna",
      description: "Puha",
      customFields: { shortDescription: "Rövid leírás", tagline: "Alcím" },
    });

    const plan = planUpload(
      live,
      file([{ key: "product|7|name", source: "Párna", translation: "Kissen" }])
    );

    expect(plan.operations[0]?.variables).toEqual({
      input: {
        id: "7",
        translations: [
          {
            languageCode: "hu",
            name: "Párna",
            slug: "parna",
            description: "Puha",
            customFields: { shortDescription: "Rövid leírás", tagline: "Alcím" },
          },
          { languageCode: "de", name: "Kissen", slug: "parna", description: "" },
        ],
      },
    });
  });

  it("never overwrites an existing translation", () => {
    const live = snapshot();
    live.products[0]?.translations.push({ languageCode: "de", name: "Polster", slug: "parna" });

    expect(
      refusal(() =>
        planUpload(live, file([{ key: "product|7|name", source: "Párna", translation: "Kissen" }]))
      )
    ).toEqual([expect.stringContaining('already translated as "Polster"')]);
  });

  it("skips strings already live with the same translation, so an aborted run can be re-run", () => {
    const live = snapshot();
    live.products[0]?.translations.push({ languageCode: "de", name: "Kissen", slug: "parna" });

    const plan = planUpload(
      live,
      file([{ key: "product|7|name", source: "Párna", translation: "Kissen" }])
    );

    expect(plan).toEqual({ operations: [], alreadyDone: ["product|7|name"] });
  });

  it("refuses the whole plan when a Hungarian source changed since the extract", () => {
    expect(
      refusal(() =>
        planUpload(
          snapshot(),
          file([
            { key: "product|7|name", source: "Régi párna", translation: "Kissen" },
            { key: "material|minky|label", source: "Minky", translation: "Minky" },
          ])
        )
      )
    ).toEqual([expect.stringContaining("the Hungarian source changed")]);
  });

  it("refuses unknown keys, duplicates and empty translations", () => {
    expect(
      refusal(() =>
        planUpload(
          snapshot(),
          file([
            { key: "product|99|name", source: "Nincs", translation: "Nichts" },
            { key: "facet|babasarok-product-type|name", source: "Terméktípus", translation: " " },
            {
              key: "facet|babasarok-product-type|name",
              source: "Terméktípus",
              translation: "Produkttyp",
            },
          ])
        )
      )
    ).toEqual([
      expect.stringContaining("empty or starts/ends with whitespace"),
      expect.stringContaining("listed twice"),
      expect.stringContaining("product|99|name: not in the live catalog"),
    ]);
  });

  it("writes a material without inventing rows for colors the file does not translate", () => {
    const plan = planUpload(
      snapshot(),
      file([
        { key: "material|minky|label", source: "Minky", translation: "Minky" },
        { key: "materialColor|minky/piros|label", source: "Piros", translation: "Rot" },
      ])
    );

    expect(plan.operations[0]?.variables).toEqual({
      id: "3",
      input: {
        slug: "minky",
        translations: [
          { languageCode: "hu", label: "Minky", subtitle: "Pihe" },
          { languageCode: "de", label: "Minky", subtitle: "", description: "" },
        ],
        thumbnailAssetId: null,
        colors: [
          {
            id: "piros",
            hex: "#f00",
            assetId: null,
            translations: [
              { languageCode: "hu", label: "Piros" },
              { languageCode: "de", label: "Rot" },
            ],
          },
          {
            id: "kek",
            hex: "#00f",
            assetId: "9",
            translations: [{ languageCode: "hu", label: "Kék" }],
          },
        ],
      },
    });
  });

  it("refuses a material write that would leave the new language without a label", () => {
    expect(
      refusal(() =>
        planUpload(
          snapshot(),
          file([{ key: "material|minky|subtitle", source: "Pihe", translation: "Flauschig" }])
        )
      )
    ).toEqual([expect.stringContaining("translate the label too")]);
  });

  it("adds the language to the definition's text objects", () => {
    const plan = planUpload(
      snapshot(),
      file([
        { key: "definition|def/parna.fields[0].label|text", source: "Méret", translation: "Größe" },
        {
          key: "definition|def/parna.fields[0].options[0].label|text",
          source: "Kicsi",
          translation: "Klein",
        },
      ])
    );

    expect(plan.operations).toEqual([
      expect.objectContaining({
        category: "definition",
        productId: "parna",
        variables: {
          productId: "parna",
          definition: {
            fields: [
              {
                id: "meret",
                label: { hu: "Méret", de: "Größe" },
                options: [{ label: { hu: "Kicsi", de: "Klein" } }],
              },
            ],
          },
        },
      }),
    ]);
  });
});

describe("verificationProblems", () => {
  const upload = file([{ key: "product|7|name", source: "Párna", translation: "Kissen" }]);
  const before = translatableStrings(snapshot(), "de");

  it("passes when only the written strings changed", () => {
    const live = snapshot();
    live.products[0]?.translations.push({ languageCode: "de", name: "Kissen", slug: "parna" });

    expect(
      verificationProblems(
        before,
        translatableStrings(live, "de"),
        upload,
        new Set(["product|7|name"])
      )
    ).toEqual([]);
  });

  it("reports a changed Hungarian source and a target text nobody wrote", () => {
    const live = snapshot();
    live.products[0]?.translations.push({ languageCode: "de", name: "Kissen", slug: "parna" });
    live.facets[0]?.translations.push({ languageCode: "de", name: "Produkttyp" });
    live.materials[0]?.colors[0]?.translations.splice(0, 1, { languageCode: "hu", label: "Vörös" });

    expect(
      verificationProblems(
        before,
        translatableStrings(live, "de"),
        upload,
        new Set(["product|7|name"])
      )
    ).toEqual([
      expect.stringContaining(
        'materialColor|minky/piros|label: Hungarian changed "Piros" → "Vörös"'
      ),
      expect.stringContaining(
        'facet|babasarok-product-type|name: de changed undefined → "Produkttyp"'
      ),
    ]);
  });
});
