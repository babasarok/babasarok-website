/**
 * "All combinations" regression coverage for an order item.
 *
 * An OrderItem's behaviour is driven by three pure modules — pricing
 * (`priceUtils`), validation (`validation`) and colour-count resolution
 * (`materialUtils`). These tests exercise every field type and material
 * configuration the Tina schema allows (radio, select, color, input, toggle,
 * custom values, length-based pricing, single/multi colour, multiple required
 * materials, discounts) so a change in any of them surfaces here.
 */
import { describe, expect, it } from "vitest";
import { calculatePriceForItem } from "@/lib/pricing/price";
import { isItemValid, sanitizeItem, validateItem } from "@/lib/pricing/validation";
import { resolveColorCount } from "@/lib/pricing/materials";
import { fieldError, makeField, makeMaterial, makeProduct } from "./fixtures";

describe("calculatePriceForItem — field combinations", () => {
  it("uses the base price when there are no fields", () => {
    const price = calculatePriceForItem(makeProduct({ price: 5000, count: 3 }));
    expect(price.basePrice.price).toBe(5000);
    expect(price.unitPrice).toBe(5000);
    expect(price.totalPrice).toBe(15_000);
    expect(price.indeterminate).toBe(false);
  });

  it("adds the selected radio option price", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 1000,
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [
              { value: "s", price: 0 },
              { value: "l", price: 500 },
            ],
            value: { value: "l" },
          }),
        ],
      })
    );
    expect(price.unitPrice).toBe(1500);
    expect(price.options).toContainEqual({ label: "meret", price: 500 });
  });

  it("counts a toggle price only when on", () => {
    const on = calculatePriceForItem(
      makeProduct({
        price: 0,
        fields: [makeField({ name: "t", type: "toggle", price: 700, value: { value: true } })],
      })
    );
    const off = calculatePriceForItem(
      makeProduct({
        price: 0,
        fields: [makeField({ name: "t", type: "toggle", price: 700, value: { value: false } })],
      })
    );
    expect(on.unitPrice).toBe(700);
    expect(off.unitPrice).toBe(0);
  });

  it("counts an embroidery price only when enabled", () => {
    const on = calculatePriceForItem(
      makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "himzes",
            type: "embroidery",
            price: 1500,
            value: { enabled: true, text: { value: "Anna" }, color: { color: "ekru" } },
          }),
        ],
      })
    );
    const off = calculatePriceForItem(
      makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "himzes",
            type: "embroidery",
            price: 1500,
            value: { enabled: false, text: { value: "Anna" }, color: { color: "ekru" } },
          }),
        ],
      })
    );
    expect(on.unitPrice).toBe(1500);
    expect(on.options).toContainEqual({ label: "himzes", price: 1500 });
    expect(off.unitPrice).toBe(0);
    expect(off.options).toHaveLength(0);
  });

  it("multiplies embroidery price by word count when priced per word", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 0,
        fields: [
          makeField({
            name: "himzes",
            type: "embroidery",
            price: 1500,
            price_unit: "word",
            value: { enabled: true, text: { value: "Anna baba" }, color: { color: "ekru" } },
          }),
        ],
      })
    );

    expect(price.unitPrice).toBe(3000);
    expect(price.options).toContainEqual({ label: "himzes", price: 3000 });
  });

  it("adds input and color field prices", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 100,
        fields: [
          makeField({ name: "nev", type: "input", price: 200, value: { value: "Anna" } }),
          makeField({
            name: "szin",
            type: "color",
            items: [{ value: "piros", price: 300 }],
            value: { value: "piros" },
          }),
        ],
      })
    );
    expect(price.unitPrice).toBe(600);
  });

  it("is indeterminate when a selected option has no price", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 1000,
        fields: [
          makeField({
            name: "opt",
            type: "radio",
            items: [{ value: "a" }],
            value: { value: "a" },
          }),
        ],
      })
    );
    expect(price.indeterminate).toBe(true);
  });

  it("does not price the length-based source field directly", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 0,
        length_based_pricing: { sourceField: "sizes" },
        fields: [
          makeField({
            name: "sizes",
            type: "radio",
            items: [{ value: "200", price: 999 }],
            value: { value: "200" },
          }),
        ],
      })
    );
    expect(price.options).toHaveLength(0);
    expect(price.unitPrice).toBe(0);
  });
});

describe("calculatePriceForItem — materials", () => {
  it("labels a single required material 'Anyag'", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 0,
        materials: [makeMaterial({ material_id: "teddy", price: 2000 })],
        material_required_count: 1,
        values: [{ material_id: "teddy", colors: [] }],
      })
    );
    expect(price.options).toContainEqual({ label: "Anyag", price: 2000 });
  });

  it("labels multiple required materials 'Anyag N'", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 0,
        materials: [
          makeMaterial({ material_id: "teddy", price: 2000 }),
          makeMaterial({ material_id: "minky", price: 2500 }),
        ],
        material_required_count: 2,
        values: [
          { material_id: "teddy", colors: [] },
          { material_id: "minky", colors: [] },
        ],
      })
    );
    expect(price.options).toContainEqual({ label: "Anyag 1", price: 2000 });
    expect(price.options).toContainEqual({ label: "Anyag 2", price: 2500 });
  });
});

describe("calculatePriceForItem — length-based pricing", () => {
  it("derives length from the source field (cm → m) and scales the price", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 0,
        length_based_pricing: { sourceField: "sizes" },
        fields: [
          makeField({
            name: "sizes",
            type: "radio",
            items: [{ value: "300" }],
            value: { value: "300" },
          }),
          makeField({
            name: "fonas",
            type: "radio",
            items: [{ value: "4", price: 8000 }],
            value: { value: "4" },
          }),
        ],
      })
    );
    if (!price.priced_by_length) {
      throw new Error("expected length-based price");
    }
    expect(price.length).toBe(3);
    expect(price.per_meter_price).toBe(8000);
    expect(price.unitPrice).toBe(24_000);
    expect(price.totalPrice).toBe(24_000);
  });

  it("leaves price undefined when the length field is empty", () => {
    const price = calculatePriceForItem(
      makeProduct({
        price: 0,
        length_based_pricing: { sourceField: "sizes" },
        fields: [makeField({ name: "sizes", type: "radio" })],
      })
    );
    if (!price.priced_by_length) {
      throw new Error("expected length-based price");
    }
    expect(price.length).toBeUndefined();
    expect(price.totalPrice).toBeUndefined();
  });
});

describe("calculatePriceForItem — discount", () => {
  it("applies a discount that is still valid", () => {
    const price = calculatePriceForItem(
      makeProduct({ price: 10_000, count: 1, discount: 25, discount_valid_until: "2999-01-01" })
    );
    expect(price.totalPrice).toBe(7500);
  });

  it("ignores an expired discount", () => {
    const price = calculatePriceForItem(
      makeProduct({ price: 10_000, count: 1, discount: 25, discount_valid_until: "2000-01-01" })
    );
    expect(price.totalPrice).toBe(10_000);
    expect(price.discountInfo).toBeUndefined();
  });
});

describe("resolveColorCount", () => {
  it("defaults to 1 when no color_count is set", () => {
    expect(resolveColorCount(makeMaterial({ material_id: "m" }), makeProduct())).toBe(1);
  });

  it("uses a numeric color_count directly", () => {
    expect(
      resolveColorCount(makeMaterial({ material_id: "m", color_count: "3" }), makeProduct())
    ).toBe(3);
  });

  it("resolves color_count from a referenced field value", () => {
    const product = makeProduct({
      fields: [makeField({ name: "fonas", type: "radio", value: { value: "5" } })],
    });
    expect(
      resolveColorCount(makeMaterial({ material_id: "m", color_count: "fonas" }), product)
    ).toBe(5);
  });

  it("returns undefined when the referenced field has no value", () => {
    const product = makeProduct({
      fields: [makeField({ name: "fonas", type: "radio" })],
    });
    expect(
      resolveColorCount(makeMaterial({ material_id: "m", color_count: "fonas" }), product)
    ).toBeUndefined();
  });
});

describe("validateItem / isItemValid", () => {
  it("flags an empty required selection", () => {
    const item = validateItem(
      makeProduct({
        fields: [makeField({ name: "meret", type: "radio", items: [{ value: "s" }] })],
      })
    );
    expect(fieldError(item.fields[0])).toBe("Kötelező mező");
    expect(isItemValid(item)).toBe(false);
  });

  it("accepts an optional empty input but rejects a required empty one", () => {
    const optional = validateItem(
      makeProduct({ fields: [makeField({ name: "x", type: "input", optional: true })] })
    );
    const required = validateItem(
      makeProduct({ fields: [makeField({ name: "x", type: "input" })] })
    );
    expect(fieldError(optional.fields[0])).toBeUndefined();
    expect(fieldError(required.fields[0])).toBe("Kötelező mező");
  });

  it("rejects a value that fails the regex", () => {
    const item = validateItem(
      makeProduct({
        fields: [
          makeField({
            name: "size",
            type: "input",
            regex: String.raw`^\d+$`,
            value: { value: "abc" },
          }),
        ],
      })
    );
    expect(fieldError(item.fields[0])).toBe("Érvénytelen formátum");
  });

  it("rejects a non-custom value that is not among the items", () => {
    const item = validateItem(
      makeProduct({
        fields: [
          makeField({ name: "c", type: "radio", items: [{ value: "a" }], value: { value: "zzz" } }),
        ],
      })
    );
    expect(fieldError(item.fields[0])).toBe("Érvénytelen érték");
  });

  it("requires embroidery text and thread color only when enabled", () => {
    const disabled = validateItem(
      makeProduct({ fields: [makeField({ name: "himzes", type: "embroidery" })] })
    );
    expect(isItemValid(disabled)).toBe(true);

    const enabled = validateItem(
      makeProduct({
        fields: [
          makeField({
            name: "himzes",
            type: "embroidery",
            value: { enabled: true, text: { value: "" }, color: { color: "" } },
          }),
        ],
      })
    );
    const field = enabled.fields[0];
    if (field.type !== "embroidery") {
      throw new Error("expected embroidery field");
    }
    expect(field.value?.text.error).toBe("Kötelező mező");
    expect(field.value?.color.error).toBe("Kötelező mező");
    expect(isItemValid(enabled)).toBe(false);

    const valid = validateItem(
      makeProduct({
        fields: [
          makeField({
            name: "himzes",
            type: "embroidery",
            value: { enabled: true, text: { value: "Anna" }, color: { color: "ekru" } },
          }),
        ],
      })
    );
    expect(isItemValid(valid)).toBe(true);
  });

  it("accepts a custom value that is not among the items", () => {
    const item = validateItem(
      makeProduct({
        fields: [
          makeField({
            name: "c",
            type: "radio",
            items: [{ value: "a" }],
            value: { value: "egyedi", is_custom: true },
          }),
        ],
      })
    );
    expect(fieldError(item.fields[0])).toBeUndefined();
  });

  it("requires the configured number of material colors", () => {
    const item = validateItem(
      makeProduct({
        materials: [
          makeMaterial({
            material_id: "m",
            color_count: "2",
            colors: [{ color_id: "a" }, { color_id: "b" }],
          }),
        ],
        material_required_count: 1,
        values: [{ material_id: "m", colors: ["a"] }],
      })
    );
    expect(item.materials.values[0]?.error).toBe("2 színt kell választani");
    expect(isItemValid(item)).toBe(false);
  });

  it("accepts a custom material color regardless of count", () => {
    const item = validateItem(
      makeProduct({
        materials: [makeMaterial({ material_id: "m", color_count: "2" })],
        material_required_count: 1,
        values: [{ material_id: "m", colors: [], custom_color: "egyedi" }],
      })
    );
    expect(item.materials.values[0]?.error).toBeUndefined();
    expect(isItemValid(item)).toBe(true);
  });

  it("fills missing material slots with required-but-empty errors", () => {
    const item = validateItem(
      makeProduct({
        materials: [makeMaterial({ material_id: "m" })],
        material_required_count: 2,
        values: [],
      })
    );
    expect(item.materials.values).toHaveLength(2);
    expect(item.materials.values.every((v) => v?.error === "Kötelező mező")).toBe(true);
  });
});

describe("sanitizeItem", () => {
  it("prefills a toggle with 'false'", () => {
    const item = sanitizeItem(makeProduct({ fields: [makeField({ name: "t", type: "toggle" })] }));
    expect(item.fields[0].value).toEqual({ value: false });
  });

  it("prefills embroidery as disabled", () => {
    const item = sanitizeItem(
      makeProduct({ fields: [makeField({ name: "himzes", type: "embroidery" })] })
    );
    expect(item.fields[0].value).toEqual({
      enabled: false,
      text: { value: "" },
      color: { color: "" },
    });
  });

  it("trims selected colors down to the allowed count", () => {
    const item = sanitizeItem(
      makeProduct({
        materials: [
          makeMaterial({
            material_id: "m",
            color_count: "2",
            colors: [{ color_id: "a" }, { color_id: "b" }, { color_id: "c" }],
          }),
        ],
        material_required_count: 1,
        values: [{ material_id: "m", colors: ["a", "b", "c"] }],
      })
    );
    expect(item.materials.values[0]?.colors).toEqual(["a", "b"]);
  });

  it("leaves custom-color selections untouched", () => {
    const item = sanitizeItem(
      makeProduct({
        materials: [makeMaterial({ material_id: "m", color_count: "1" })],
        material_required_count: 1,
        values: [{ material_id: "m", colors: [], custom_color: "egyedi" }],
      })
    );
    expect(item.materials.values[0]?.custom_color).toBe("egyedi");
  });
});
