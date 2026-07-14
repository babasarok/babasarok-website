/**
 * Conditional field visibility (`depends_on`).
 *
 * A field configured with `depends_on` is only active when the referenced field
 * currently holds the required value (or, when no value is given, any value).
 * `isFieldVisible` is the single source of truth the order form, pricing and
 * validation all consult, so these tests cover the helper directly plus its two
 * integrations that matter to the user: hidden fields drop out of the price and
 * never block submission.
 */
import { describe, expect, it } from "vitest";
import { isFieldVisible } from "@/lib/fieldVisibility";
import { calculatePriceForItem } from "@/lib/priceUtils";
import { isItemValid, validateItem } from "@/lib/validation";
import type { Field } from "@/lib/types.svelte";
import { makeField, makeProduct } from "./fixtures";

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
    expect(extra?.value?.error).toBeUndefined();
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
    expect(item.fields.find((f) => f.name === "extra")?.value?.error).toBeUndefined();
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
    expect(item.fields.find((f) => f.name === "extra")?.value?.error).toBe("Kötelező mező");
    expect(isItemValid(item)).toBe(false);
  });
});
