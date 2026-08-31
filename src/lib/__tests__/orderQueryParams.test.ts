/**
 * URL query-param prefill for product pages. See {@link prefillFromParams} and
 * docs — reserved keys are `uuid` and `count`; fields are keyed by name and
 * materials by `m<index>`.
 */
import { describe, expect, it } from "vitest";
import { prefillFromParams } from "@/lib/order/queryParams";
import { makeProduct, makeField, makeMaterial } from "./fixtures";

describe("prefillFromParams", () => {
  it("sets the item count from a valid count param", () => {
    const item = makeProduct();
    prefillFromParams(item, new URLSearchParams("count=3"));
    expect(item.count).toBe(3);
  });

  it("ignores an invalid or reserved count", () => {
    const item = makeProduct({ count: 1 });
    prefillFromParams(item, new URLSearchParams("count=0"));
    expect(item.count).toBe(1);
    prefillFromParams(item, new URLSearchParams("count=abc"));
    expect(item.count).toBe(1);
  });

  it("prefills a string-valued field by its name", () => {
    const item = makeProduct({
      fields: [makeField({ name: "szin", type: "color", items: [{ value: "piros" }] })],
    });
    prefillFromParams(item, new URLSearchParams("szin=piros"));
    expect(item.fields[0].value).toEqual({ value: "piros" });
  });

  it("marks an unknown value as custom when the field allows it", () => {
    const item = makeProduct({
      fields: [
        makeField({
          name: "szin",
          type: "color",
          allow_custom_value: true,
          items: [{ value: "piros" }],
        }),
      ],
    });
    prefillFromParams(item, new URLSearchParams("szin=%23abcdef"));
    expect(item.fields[0].value).toEqual({ value: "#abcdef", is_custom: true });
  });

  it("parses a toggle field", () => {
    const item = makeProduct({ fields: [makeField({ name: "premium", type: "toggle" })] });
    prefillFromParams(item, new URLSearchParams("premium=true"));
    expect(item.fields[0].value).toEqual({ value: true });
  });

  it("enables an embroidery field with text and colour", () => {
    const item = makeProduct({ fields: [makeField({ name: "himzes", type: "embroidery" })] });
    prefillFromParams(item, new URLSearchParams("himzes=Anna&himzes_color=gold"));
    expect(item.fields[0].value).toEqual({
      enabled: true,
      text: { value: "Anna" },
      color: { color: "gold" },
    });
  });

  it("treats a field literally named `*_color` as a plain field, not an embroidery colour param", () => {
    const item = makeProduct({
      fields: [
        makeField({ name: "himzes", type: "embroidery" }),
        makeField({ name: "himzes_color", type: "color", items: [{ value: "piros" }] }),
      ],
    });
    prefillFromParams(item, new URLSearchParams("himzes_color=piros"));
    expect(item.fields[1].value).toEqual({ value: "piros" });
    expect(item.fields[0].value).toBeUndefined();
  });

  it("treats a field literally named `*_custom_color` as a plain field", () => {
    const item = makeProduct({
      fields: [
        makeField({ name: "himzes", type: "embroidery" }),
        makeField({ name: "himzes_custom_color", type: "color", items: [{ value: "piros" }] }),
      ],
    });
    prefillFromParams(item, new URLSearchParams("himzes_custom_color=piros"));
    expect(item.fields[1].value).toEqual({ value: "piros" });
    expect(item.fields[0].value).toBeUndefined();
  });

  it("prefills a material slot with colours within the required count", () => {
    const item = makeProduct({
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    prefillFromParams(item, new URLSearchParams("m0=cotton&m0_colors=red,blue"));
    expect(item.materials.values[0]).toEqual({ material_id: "cotton", colors: ["red", "blue"] });
  });

  it("ignores material slots beyond the required count", () => {
    const item = makeProduct({
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    prefillFromParams(item, new URLSearchParams("m2=cotton"));
    expect(item.materials.values[2]).toBeUndefined();
  });

  it("ignores unknown keys", () => {
    const item = makeProduct({ fields: [makeField({ name: "szin", type: "color" })] });
    prefillFromParams(item, new URLSearchParams("bogus=1&uuid=xyz"));
    expect(item.fields[0].value).toBeUndefined();
  });
});
