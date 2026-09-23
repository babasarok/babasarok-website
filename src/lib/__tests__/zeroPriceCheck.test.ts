/**
 * The "no product may sell for 0 Ft" build-time check.
 *
 * `findZeroPriceCombinations` enumerates every configuration the order form
 * lets a buyer complete and reports the ones that price at 0 Ft. These tests
 * pin down which configurations count as reachable — mirroring the form's own
 * rules (required selections, `depends_on`, `banned_combinations`, custom
 * values) — and how length-priced products are judged.
 */
import type { IProduct } from "@/lib/types.svelte";
import { describe, expect, it } from "vitest";
import { calculatePriceForItem } from "@/lib/pricing/price";
import { findZeroPriceCombinations } from "@/lib/pricing/validCombinations";
import { makeField, makeMaterial, makeProduct } from "./fixtures";

/** The held value of a radio field, or `undefined` when not a radio. */
function radioValue(product: IProduct, name: string): string | undefined {
  const field = product.fields.find((f) => f.name === name);
  if (!field || field.type !== "radio") {
    return undefined;
  }
  return field.value?.value;
}

describe("findZeroPriceCombinations", () => {
  describe("base price", () => {
    it("flags a product with no configuration and a 0 base price", () => {
      const product = makeProduct({ price: 0 });
      const zero = findZeroPriceCombinations(product);
      expect(zero).toHaveLength(1);
      expect(zero[0].unitPrice).toBe(0);
    });

    it("passes a product with a positive base price", () => {
      expect(findZeroPriceCombinations(makeProduct({ price: 5000 }))).toHaveLength(0);
    });

    it("flags an all-free option combination on a 0 base price", () => {
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [
              { value: "s", label: "S", price: 0 },
              { value: "l", label: "L", price: 1000 },
            ],
          }),
        ],
      });
      const zero = findZeroPriceCombinations(product);
      // Only the "S" selection (0) is free; "L" (1000) is not.
      expect(zero).toHaveLength(1);
      expect(radioValue(zero[0].product, "meret")).toBe("s");
    });

    it("does not flag an option combination whose other options are priced", () => {
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [
              { value: "s", label: "S", price: 100 },
              { value: "l", label: "L", price: 200 },
            ],
          }),
        ],
      });
      // Every selectable option is priced → no free configuration.
      expect(findZeroPriceCombinations(product)).toHaveLength(0);
    });
  });

  describe("material slots", () => {
    it("flags a 0-base product with required free materials", () => {
      const product = makeProduct({
        price: 0,
        materials: [makeMaterial({ material_id: "m1", price: 0 })],
      });
      expect(findZeroPriceCombinations(product)).toHaveLength(1);
    });

    it("passes when every material is priced", () => {
      const product = makeProduct({
        price: 0,
        materials: [makeMaterial({ material_id: "m1", price: 1000 })],
      });
      expect(findZeroPriceCombinations(product)).toHaveLength(0);
    });

    it("flags one of several material slots being free", () => {
      const product = makeProduct({
        price: 0,
        materials: [
          makeMaterial({ material_id: "m1", price: 0 }),
          makeMaterial({ material_id: "m2", price: 1000 }),
        ],
      });
      const zero = findZeroPriceCombinations(product);
      expect(zero).toHaveLength(1);
      expect(zero[0].product.materials.values[0]?.material_id).toBe("m1");
    });

    it("skips banned material combinations", () => {
      const product = makeProduct({
        price: 0,
        material_required_count: 2,
        materials: [
          makeMaterial({ material_id: "m1", price: 0 }),
          makeMaterial({ material_id: "m2", price: 0 }),
          makeMaterial({ material_id: "m3", price: 500 }),
        ],
        banned_combinations: [
          {
            materials: [
              { material_path: { material_id: "m1" } },
              { material_path: { material_id: "m2" } },
            ],
          },
        ],
      });
      // (m1, m2) and (m2, m1) are banned; (m1, m1) and (m2, m2) stay free.
      const zero = findZeroPriceCombinations(product);
      expect(zero.map((c) => c.product.materials.values.map((v) => v?.material_id))).toEqual([
        ["m1", "m1"],
        ["m2", "m2"],
      ]);
    });

    it("applies banned-combination multiplicity like the form picker", () => {
      const product = makeProduct({
        price: 0,
        material_required_count: 2,
        materials: [
          makeMaterial({ material_id: "m1", price: 0 }),
          makeMaterial({ material_id: "m2", price: 500 }),
        ],
        banned_combinations: [
          {
            materials: [
              { material_path: { material_id: "m1" } },
              { material_path: { material_id: "m1" } },
            ],
          },
        ],
      });
      // (m1, m1) is banned, (m1, m2) and (m2, m1) price at 500.
      expect(findZeroPriceCombinations(product)).toHaveLength(0);
    });
  });

  describe("toggles and inputs", () => {
    it("considers both toggle states", () => {
      const off = makeProduct({
        price: 1000,
        fields: [makeField({ name: "t", type: "toggle", price: 1000 })],
      });
      expect(findZeroPriceCombinations(off)).toHaveLength(0);
    });

    it("ignores free non-optional inputs (they never block, never price)", () => {
      const product = makeProduct({
        price: 0,
        fields: [makeField({ name: "nev", type: "input" })],
      });
      expect(findZeroPriceCombinations(product)).toHaveLength(1);
    });

    it("does not force embroidery on (it only adds price)", () => {
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "himzes",
            type: "embroidery",
            price: 1500,
            value: { enabled: false, text: { value: "" }, color: { color: "" } },
          }),
        ],
      });
      expect(findZeroPriceCombinations(product)).toHaveLength(1);
    });
  });

  describe("depends_on", () => {
    it("treats a hidden dependent field as absent (its price cannot rescue the base)", () => {
      // `meret` is not chosen, so `betet` is hidden — but the base itself is 0.
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [
              { value: "s", label: "S", price: 0 },
              { value: "l", label: "L", price: 1000 },
            ],
          }),
          makeField({
            name: "betet",
            type: "radio",
            depends_on: { field: "meret", value: "l" },
            items: [
              { value: "plain", label: "Plain", price: 0 },
              { value: "padded", label: "Padded", price: 500 },
            ],
          }),
        ],
      });
      // Hidden betet + base 0 + free "S" → free.
      expect(findZeroPriceCombinations(product)).toHaveLength(1);
    });

    it("prices the dependent field once its parent is chosen", () => {
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [{ value: "l", label: "L", price: 0 }],
          }),
          makeField({
            name: "betet",
            type: "radio",
            depends_on: { field: "meret", value: "l" },
            items: [
              { value: "plain", label: "Plain", price: 0 },
              { value: "padded", label: "Padded", price: 500 },
            ],
          }),
        ],
      });
      // betet is visible; "Plain" is a free, reachable combination.
      const zero = findZeroPriceCombinations(product);
      expect(zero).toHaveLength(1);
      expect(radioValue(zero[0].product, "betet")).toBe("plain");
    });
  });

  describe("custom values", () => {
    it("treats an allowed custom value as a 0-priced selection", () => {
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            allow_custom_value: true,
            items: [{ value: "s", label: "S", price: 1000 }],
          }),
        ],
      });
      // The listed option is priced, but a typed-in custom value prices at 0.
      expect(findZeroPriceCombinations(product)).toHaveLength(1);
    });

    it("does not consider custom values when the field forbids them", () => {
      const product = makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [{ value: "s", label: "S", price: 1000 }],
          }),
        ],
      });
      expect(findZeroPriceCombinations(product)).toHaveLength(0);
    });
  });

  describe("length-based pricing", () => {
    const lengthProduct = (base: number, braided?: boolean): IProduct =>
      makeProduct({
        price: base,
        length_based_pricing: { sourceField: "sizes" },
        fields: [
          makeField({
            name: "sizes",
            type: "radio",
            allow_custom_value: true,
            items: [{ value: "200", label: "200cm" }],
          }),
          ...(braided
            ? [
                makeField({
                  name: "fonas",
                  type: "radio",
                  items: [
                    { value: "3", label: "Hármas", price: 7500 },
                    { value: "9", label: "Ingyenes", price: 0 },
                  ],
                }),
              ]
            : []),
        ],
      });

    it("flags a length-priced product whose per-meter price is 0 (any length sells for free)", () => {
      const zero = findZeroPriceCombinations(lengthProduct(0));
      expect(zero).toHaveLength(1);
      expect(zero[0].perMeterPrice).toBe(0);
    });

    it("passes when the per-meter price is positive", () => {
      expect(findZeroPriceCombinations(lengthProduct(6500))).toHaveLength(0);
    });

    it("reports the per-meter price, not a scaled unit price", () => {
      const product = lengthProduct(0, true);
      const zero = findZeroPriceCombinations(product);
      // Only the free braid selection (Ingyenes) zeroes the per-meter price.
      expect(zero).toHaveLength(1);
      expect(zero[0].perMeterPrice).toBe(0);
      // Sanity: the same configuration through the real pricer also yields 0.
      const priced = calculatePriceForItem(zero[0].product);
      expect(priced.priced_by_length).toBe(true);
      if (priced.priced_by_length) {
        expect(priced.per_meter_price).toBe(0);
      }
    });

    it("does not flag a free option when the base alone covers every meter", () => {
      const product = lengthProduct(7500, true);
      // Per-meter is always ≥ 7500 (base) → never free, even with the 0-Ft braid.
      expect(findZeroPriceCombinations(product)).toHaveLength(0);
    });
  });
});
