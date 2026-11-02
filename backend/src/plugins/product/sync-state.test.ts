import { describe, expect, it } from "vitest";
import { nativeStateDiff, nativeStateHash, type NativeProductState } from "./sync-state";

const nativeState: NativeProductState = {
  optionGroups: [
    {
      code: "meret",
      name: "Méret",
      options: [
        { code: "kicsi", name: "Kicsi" },
        { code: "nagy", name: "Nagy" },
      ],
    },
  ],
  variants: [
    {
      sku: "babafeszek--kicsi",
      name: "Babafészek (Kicsi)",
      price: 15_000,
      options: [{ groupCode: "meret", optionCode: "kicsi" }],
      facetValues: ["wellsoft"],
    },
    {
      sku: "babafeszek--nagy",
      name: "Babafészek (Nagy)",
      price: 16_000,
      options: [{ groupCode: "meret", optionCode: "nagy" }],
      facetValues: ["velur", "velur--barna"],
    },
  ],
};

describe("nativeStateHash", () => {
  it("is stable under option-group, option, variant and facet-value ordering", () => {
    const reordered: NativeProductState = {
      optionGroups: [
        {
          code: "meret",
          name: "Méret",
          options: [
            { code: "nagy", name: "Nagy" },
            { code: "kicsi", name: "Kicsi" },
          ],
        },
      ],
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--nagy"
          ? { ...variant, facetValues: ["velur--barna", "velur"] }
          : variant
      ),
    };

    expect(nativeStateHash(reordered)).toBe(nativeStateHash(nativeState));
  });

  it("changes when a native price, name or option assignment is edited", () => {
    const repriced: NativeProductState = {
      ...nativeState,
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--nagy" ? { ...variant, price: 99_000 } : variant
      ),
    };
    const renamed: NativeProductState = {
      ...nativeState,
      optionGroups: nativeState.optionGroups.map((group) =>
        group.code === "meret" ? { ...group, name: "Méret!" } : group
      ),
    };
    const reassigned: NativeProductState = {
      ...nativeState,
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--nagy"
          ? { ...variant, options: [{ groupCode: "meret", optionCode: "kicsi" }] }
          : variant
      ),
    };
    const refaceted: NativeProductState = {
      ...nativeState,
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--nagy" ? { ...variant, facetValues: [] } : variant
      ),
    };

    expect(nativeStateHash(repriced)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(renamed)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(reassigned)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(refaceted)).not.toBe(nativeStateHash(nativeState));
  });
});

describe("nativeStateDiff", () => {
  it("reports no differences for identical states regardless of ordering", () => {
    const reordered: NativeProductState = {
      ...nativeState,
      variants: [...nativeState.variants].toSorted((a, b) => b.sku.localeCompare(a.sku)),
      optionGroups: [
        {
          code: "meret",
          name: "Méret",
          options: [...(nativeState.optionGroups[0]?.options ?? [])].toSorted((a, b) =>
            b.code.localeCompare(a.code)
          ),
        },
      ],
    };

    expect(nativeStateDiff(reordered, nativeState)).toEqual([]);
  });

  it("reports created and removed option groups and options", () => {
    const drifted: NativeProductState = {
      ...nativeState,
      optionGroups: [
        {
          code: "meret",
          name: "Méret",
          options: [{ code: "kicsi", name: "Kicsi" }],
        },
        { code: "suly", name: "Súly", options: [{ code: "konnyu", name: "Könnyű" }] },
      ],
    };

    expect(nativeStateDiff(nativeState, drifted)).toEqual([
      { kind: "presence", label: 'Opció "meret/nagy" (Nagy) létrehozásra vár' },
      { kind: "presence", label: 'Opciócsoport "suly" (Súly) törlésre vár' },
    ]);
  });

  it("reports renamed option groups and options", () => {
    const drifted: NativeProductState = {
      ...nativeState,
      optionGroups: [
        {
          code: "meret",
          name: "Méret!",
          options: [
            { code: "kicsi", name: "Kicsi" },
            { code: "nagy", name: "Nagy" },
          ],
        },
      ],
    };

    expect(nativeStateDiff(nativeState, drifted)).toEqual([
      { kind: "rename", label: 'Opciócsoport "meret" átnevezve: "Méret!" → "Méret"' },
    ]);
  });

  it("reports removed, repriced and reoptioned variants", () => {
    const drifted: NativeProductState = {
      ...nativeState,
      variants: [
        {
          sku: "babafeszek--kicsi",
          name: "Babafészek (Kicsi)",
          price: 15_000,
          options: [{ groupCode: "meret", optionCode: "kicsi" }],
          facetValues: ["wellsoft"],
        },
        {
          sku: "babafeszek--nagy",
          name: "Babafészek (Nagy)",
          price: 99_000,
          options: [{ groupCode: "meret", optionCode: "kicsi" }],
          facetValues: ["velur", "velur--barna"],
        },
        { sku: "babafeszek--uj", name: "Babafészek (Új)", price: 1, options: [], facetValues: [] },
      ],
    };

    expect(nativeStateDiff(nativeState, drifted)).toEqual([
      {
        kind: "price",
        label: 'Változat "babafeszek--nagy" ára eltér: 99000 → 16000',
      },
      { kind: "options", label: 'Változat "babafeszek--nagy" opciói eltérnek' },
      {
        kind: "presence",
        label: 'Változat "babafeszek--uj" (Babafészek (Új)) törlésre vár',
      },
    ]);
  });

  it("reports drifted variant facet values regardless of ordering", () => {
    const drifted: NativeProductState = {
      ...nativeState,
      variants: nativeState.variants.map((variant) =>
        variant.sku === "babafeszek--kicsi"
          ? { ...variant, facetValues: ["masik", "wellsoft"] }
          : variant
      ),
    };

    expect(nativeStateDiff(nativeState, drifted)).toEqual([
      { kind: "facets", label: 'Változat "babafeszek--kicsi" facet értékei eltérnek' },
    ]);
  });
});
