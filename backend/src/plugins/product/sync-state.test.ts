import { describe, expect, it } from "vitest";
import { nativeStateHash, type NativeProductState } from "./sync-state";

const nativeState: NativeProductState = {
  slug: "babafeszek",
  name: "Babafészek",
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
      slug: "babafeszek",
      name: "Babafészek",
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
