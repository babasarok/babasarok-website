/**
 * The product field module (`product/field`): typed value access (issue #15)
 * and conditional visibility (`depends_on`).
 *
 * Field references resolve to their value through here, narrowing on `kind`
 * instead of coercing a raw string; `isFieldVisible` is the single source of
 * truth the order form, pricing and validation all consult. These tests cover
 * the helpers directly plus the two integrations that matter to the user:
 * hidden fields drop out of the price and never block submission.
 */
import { describe, expect, it } from "vitest";
import {
  findFieldByName,
  resolveFieldValue,
  resolveNumericValue,
  isFieldVisible,
} from "@/lib/product/field";
import { calculatePriceForItem } from "@/lib/pricing/price";
import { isItemValid, validateItem } from "@/lib/product/validation";
import type { Field } from "@/lib/types.svelte";
import { fieldError, makeField, makeProduct } from "./fixtures";

describe("resolveFieldValue", () => {
  it("is empty for a missing field", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(resolveFieldValue(undefined)).toEqual({ kind: "empty" });
  });

  it("is empty for an embroidery field (no scalar to reference)", () => {
    const field = makeField({ name: "himzes", type: "embroidery" });
    expect(resolveFieldValue(field)).toEqual({ kind: "empty" });
  });

  it("resolves a toggle to a boolean", () => {
    const field = makeField({ name: "csomag", type: "toggle", value: { value: true } });
    expect(resolveFieldValue(field)).toEqual({ kind: "boolean", value: true });
  });

  it("resolves a filled string field to a string", () => {
    const field = makeField({ name: "nev", type: "input", value: { value: "Anna" } });
    expect(resolveFieldValue(field)).toEqual({ kind: "string", value: "Anna" });
  });

  it("collapses a blank string value to empty", () => {
    const field = makeField({ name: "nev", type: "input", value: { value: "" } });
    expect(resolveFieldValue(field)).toEqual({ kind: "empty" });
  });
});

describe("resolveNumericValue", () => {
  it("parses a numeric string value", () => {
    const field = makeField({ name: "meret", type: "radio", value: { value: "300" } });
    expect(resolveNumericValue(field)).toBe(300);
  });

  it("is undefined for a non-numeric string", () => {
    const field = makeField({ name: "meret", type: "radio", value: { value: "nagy" } });
    expect(resolveNumericValue(field)).toBeUndefined();
  });

  it("is undefined for a toggle (non-string value)", () => {
    const field = makeField({ name: "csomag", type: "toggle", value: { value: true } });
    expect(resolveNumericValue(field)).toBeUndefined();
  });

  it("is undefined for a missing field", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(resolveNumericValue(undefined)).toBeUndefined();
  });
});

describe("findFieldByName", () => {
  it("finds a field by its name", () => {
    const a = makeField({ name: "a", type: "input" });
    const b = makeField({ name: "b", type: "input" });
    expect(findFieldByName([a, b], "b")).toBe(b);
  });

  it("returns undefined when no field matches", () => {
    const a = makeField({ name: "a", type: "input" });
    expect(findFieldByName([a], "nincs")).toBeUndefined();
  });
});

describe("isFieldVisible", () => {
  it("shows a field with no dependency", () => {
    const field = makeField({ name: "a", type: "input" });
    expect(isFieldVisible(field, [field])).toBe(true);
  });

  it("shows a field whose dependency has an empty `field`", () => {
    const field = makeField({ name: "a", type: "input", depends_on: { field: "", value: "x" } });
    expect(isFieldVisible(field, [field])).toBe(true);
  });

  it("shows a field when the referenced field is missing", () => {
    const field = makeField({
      name: "a",
      type: "input",
      depends_on: { field: "nincs", value: "x" },
    });
    expect(isFieldVisible(field, [field])).toBe(true);
  });

  describe("with a required value", () => {
    const target = makeField({
      name: "meret",
      type: "radio",
      items: [{ value: "s" }, { value: "l" }],
    });
    const dependent = makeField({
      name: "extra",
      type: "input",
      depends_on: { field: "meret", value: "l" },
    });

    it("hides when the target value differs", () => {
      const fields = [{ ...target, value: { value: "s" } } as Field, dependent];
      expect(isFieldVisible(dependent, fields)).toBe(false);
    });

    it("hides when the target has no value yet", () => {
      expect(isFieldVisible(dependent, [target, dependent])).toBe(false);
    });

    it("shows when the target value matches", () => {
      const fields = [{ ...target, value: { value: "l" } } as Field, dependent];
      expect(isFieldVisible(dependent, fields)).toBe(true);
    });
  });

  describe("without a required value (any value)", () => {
    const dependent = makeField({
      name: "extra",
      type: "input",
      depends_on: { field: "nev" },
    });

    it("hides while the target is empty", () => {
      const target = makeField({ name: "nev", type: "input" });
      expect(isFieldVisible(dependent, [target, dependent])).toBe(false);
    });

    it("shows once the target has any value", () => {
      const target = makeField({ name: "nev", type: "input", value: { value: "Anna" } });
      expect(isFieldVisible(dependent, [target, dependent])).toBe(true);
    });
  });

  it("treats a toggle dependency by its string value", () => {
    const toggle = makeField({ name: "csomagolas", type: "toggle", value: { value: true } });
    const dependent = makeField({
      name: "uzenet",
      type: "input",
      depends_on: { field: "csomagolas", value: "true" },
    });
    expect(isFieldVisible(dependent, [toggle, dependent])).toBe(true);
    expect(
      isFieldVisible(dependent, [{ ...toggle, value: { value: false } } as Field, dependent])
    ).toBe(false);
  });
});

describe("pricing ignores hidden fields", () => {
  it("excludes a hidden field's price from the unit price", () => {
    const hidden = calculatePriceForItem(
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
            value: { value: "s" },
          }),
          makeField({
            name: "extra",
            type: "input",
            price: 900,
            value: { value: "kérek" },
            depends_on: { field: "meret", value: "l" },
          }),
        ],
      })
    );
    expect(hidden.unitPrice).toBe(1000);
    expect(hidden.options.some((o) => o.label === "extra")).toBe(false);
  });

  it("includes the field's price once the dependency is met", () => {
    const shown = calculatePriceForItem(
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
          makeField({
            name: "extra",
            type: "input",
            price: 900,
            value: { value: "kérek" },
            depends_on: { field: "meret", value: "l" },
          }),
        ],
      })
    );
    expect(shown.unitPrice).toBe(2400);
    expect(shown.options).toContainEqual({ label: "extra", price: 900 });
  });
});

describe("validation ignores hidden fields", () => {
  it("does not require a hidden field", () => {
    const item = validateItem(
      makeProduct({
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [{ value: "s" }, { value: "l" }],
            value: { value: "s" },
          }),
          makeField({
            name: "extra",
            type: "select",
            items: [{ value: "a" }],
            depends_on: { field: "meret", value: "l" },
          }),
        ],
      })
    );
    const extra = item.fields.find((f) => f.name === "extra");
    expect(fieldError(extra)).toBeUndefined();
    expect(isItemValid(item)).toBe(true);
  });

  it("clears a stale error when a field becomes hidden", () => {
    const item = makeProduct({
      fields: [
        makeField({
          name: "meret",
          type: "radio",
          items: [{ value: "s" }, { value: "l" }],
          value: { value: "s" },
        }),
        makeField({
          name: "extra",
          type: "select",
          items: [{ value: "a" }],
          value: { value: "", error: "Kötelező mező" },
          depends_on: { field: "meret", value: "l" },
        }),
      ],
    });
    validateItem(item);
    expect(fieldError(item.fields.find((f) => f.name === "extra"))).toBeUndefined();
    expect(isItemValid(item)).toBe(true);
  });

  it("still requires a field once its dependency is met", () => {
    const item = validateItem(
      makeProduct({
        fields: [
          makeField({
            name: "meret",
            type: "radio",
            items: [{ value: "s" }, { value: "l" }],
            value: { value: "l" },
          }),
          makeField({
            name: "extra",
            type: "select",
            items: [{ value: "a" }],
            depends_on: { field: "meret", value: "l" },
          }),
        ],
      })
    );
    expect(fieldError(item.fields.find((f) => f.name === "extra"))).toBe("Kötelező mező");
    expect(isItemValid(item)).toBe(false);
  });
});
