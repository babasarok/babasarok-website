import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalJson } from "../../shared/product-definition/index";
import { nativeStateDiff, nativeStateHash, type NativeProductState } from "./sync-state";

const nativeState: NativeProductState = {
  optionGroups: [
    {
      code: "meret",
      name: { hu: "Méret" },
      options: [
        { code: "kicsi", name: { hu: "Kicsi" } },
        { code: "nagy", name: { hu: "Nagy" } },
      ],
    },
  ],
  variants: [
    {
      sku: "babafeszek--kicsi",
      name: { hu: "Babafészek (Kicsi)" },
      price: 15_000,
      options: [{ groupCode: "meret", optionCode: "kicsi" }],
    },
    {
      sku: "babafeszek--nagy",
      name: { hu: "Babafészek (Nagy)" },
      price: 16_000,
      options: [{ groupCode: "meret", optionCode: "nagy" }],
    },
  ],
};

describe("nativeStateHash", () => {
  it("sorts by code unit, independent of the ICU locale", () => {
    const state: NativeProductState = {
      optionGroups: [
        { code: "cz", name: { hu: "Cz" }, options: [] },
        { code: "cs", name: { hu: "Cs" }, options: [{ code: "cz", name: { hu: "Cz" } }] },
      ],
      variants: [
        {
          sku: "ab",
          name: { hu: "Zz" },
          price: 1,
          options: [{ groupCode: "cz", optionCode: "cs" }],
        },
      ],
    };

    const expected = createHash("sha256")
      .update(
        canonicalJson({
          optionGroups: [
            { code: "cs", name: { hu: "Cs" }, options: [{ code: "cz", name: { hu: "Cz" } }] },
            { code: "cz", name: { hu: "Cz" }, options: [] },
          ],
          variants: [
            {
              sku: "ab",
              name: { hu: "Zz" },
              price: 1,
              options: [{ groupCode: "cz", optionCode: "cs" }],
            },
          ],
        })
      )
      .digest("hex");

    expect(nativeStateHash(state)).toBe(expected);
  });

  it("is stable under option-group, option and variant ordering", () => {
    const reordered: NativeProductState = {
      optionGroups: [
        {
          code: "meret",
          name: { hu: "Méret" },
          options: [
            { code: "nagy", name: { hu: "Nagy" } },
            { code: "kicsi", name: { hu: "Kicsi" } },
          ],
        },
      ],
      variants: nativeState.variants.toReversed(),
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
        group.code === "meret" ? { ...group, name: { hu: "Méret!" } } : group
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

    expect(nativeStateHash(repriced)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(renamed)).not.toBe(nativeStateHash(nativeState));
    expect(nativeStateHash(reassigned)).not.toBe(nativeStateHash(nativeState));
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
          name: { hu: "Méret" },
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
          name: { hu: "Méret" },
          options: [{ code: "kicsi", name: { hu: "Kicsi" } }],
        },
        {
          code: "suly",
          name: { hu: "Súly" },
          options: [{ code: "konnyu", name: { hu: "Könnyű" } }],
        },
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
          name: { hu: "Méret!" },
          options: [
            { code: "kicsi", name: { hu: "Kicsi" } },
            { code: "nagy", name: { hu: "Nagy" } },
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
          name: { hu: "Babafészek (Kicsi)" },
          price: 15_000,
          options: [{ groupCode: "meret", optionCode: "kicsi" }],
        },
        {
          sku: "babafeszek--nagy",
          name: { hu: "Babafészek (Nagy)" },
          price: 99_000,
          options: [{ groupCode: "meret", optionCode: "kicsi" }],
        },
        {
          sku: "babafeszek--uj",
          name: { hu: "Babafészek (Új)" },
          price: 1,
          options: [],
        },
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
});
