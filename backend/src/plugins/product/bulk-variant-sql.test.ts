import { describe, expect, it } from "vitest";
import { buildChunkedInsert, desiredFacetJoins, diffTranslations } from "./bulk-variant-sql";

describe("buildChunkedInsert", () => {
  it("chunks rows and restarts parameter numbering per chunk", () => {
    const rows = Array.from({ length: 5 }, (_, i) => [i, `sku-${i}`]);
    const statements = buildChunkedInsert("product_variant", ["id", "sku"], rows, 2, "id");

    expect(statements).toHaveLength(3);
    expect(statements[0].sql).toBe(
      'insert into "product_variant" ("id", "sku") values ($1, $2), ($3, $4) returning "id"'
    );
    expect(statements[0].params).toEqual([0, "sku-0", 1, "sku-1"]);
    expect(statements[1].sql).toBe(
      'insert into "product_variant" ("id", "sku") values ($1, $2), ($3, $4) returning "id"'
    );
    expect(statements[1].params).toEqual([2, "sku-2", 3, "sku-3"]);
    expect(statements[2].sql).toBe(
      'insert into "product_variant" ("id", "sku") values ($1, $2) returning "id"'
    );
    expect(statements[2].params).toEqual([4, "sku-4"]);
  });

  it("omits the returning clause when not asked", () => {
    const statements = buildChunkedInsert("t", ["a"], [[1]], 10);

    expect(statements[0].sql).toBe('insert into "t" ("a") values ($1)');
  });

  it("produces no statements for no rows", () => {
    expect(buildChunkedInsert("t", ["a"], [], 10)).toEqual([]);
  });
});

describe("diffTranslations", () => {
  it("inserts missing languages and updates changed names, never deletes", () => {
    const diff = diffTranslations(
      [
        { id: 11, baseId: 1, languageCode: "hu", name: "régi" },
        { id: 12, baseId: 1, languageCode: "en", name: "old" },
        { id: 13, baseId: 2, languageCode: "hu", name: "másik" },
      ],
      [
        { variantId: 1, languageCode: "hu", name: "új" },
        { variantId: 1, languageCode: "en", name: "old" },
        { variantId: 1, languageCode: "de", name: "neu" },
        { variantId: 2, languageCode: "hu", name: "másik" },
      ]
    );

    expect(diff.toInsert).toEqual([{ baseId: 1, languageCode: "de", name: "neu" }]);
    expect(diff.toUpdate).toEqual([{ id: 11, name: "új" }]);
  });

  it("treats an empty planned set as no writes", () => {
    const diff = diffTranslations([{ id: 11, baseId: 1, languageCode: "hu", name: "régi" }], []);

    expect(diff).toEqual({ toInsert: [], toUpdate: [] });
  });
});

describe("desiredFacetJoins", () => {
  const memberships = [
    { facetValueId: 10, channelId: 1 },
    { facetValueId: 20, channelId: 2 },
  ];

  it("keeps other-channel facet values and replaces the current-channel set", () => {
    const desired = desiredFacetJoins(
      [
        { productVariantId: 1, facetValueId: 10 },
        { productVariantId: 1, facetValueId: 20 },
      ],
      memberships,
      1,
      [{ id: 1, facetValueIds: [30] }]
    );

    expect(desired).toEqual([
      { productVariantId: 1, facetValueId: 30 },
      { productVariantId: 1, facetValueId: 20 },
    ]);
  });

  it("drops kept values that the plan also carries, without duplicating", () => {
    const desired = desiredFacetJoins([{ productVariantId: 1, facetValueId: 20 }], memberships, 1, [
      { id: 1, facetValueIds: [20, 30] },
    ]);

    expect(desired).toEqual([
      { productVariantId: 1, facetValueId: 20 },
      { productVariantId: 1, facetValueId: 30 },
    ]);
  });

  it("ignores other variants' kept values", () => {
    const desired = desiredFacetJoins([{ productVariantId: 2, facetValueId: 10 }], memberships, 1, [
      { id: 1, facetValueIds: [30] },
    ]);

    expect(desired).toEqual([{ productVariantId: 1, facetValueId: 30 }]);
  });
});
