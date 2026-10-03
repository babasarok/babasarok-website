/**
 * URL query-param prefill for product pages. See {@link prefillFromParams} and
 * docs — reserved keys are `uuid` and `count`; fields are keyed by name,
 * including `material` fields (plus their `<name>_colors` companion).
 */
import { describe, expect, it } from "vitest";
import { prefillFromParams, buildMaterialParams } from "@/lib/order/queryParams";
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

  it("prefills a material field by its name, with colours", () => {
    const item = makeProduct({
      fields: [
        makeField({
          name: "anyag",
          type: "material",
          materials: [makeMaterial({ material_id: "cotton" })],
        }),
      ],
    });
    prefillFromParams(item, new URLSearchParams("anyag=cotton&anyag_colors=red,blue"));
    const field = item.fields[0];
    if (field.type !== "material") {
      throw new Error("expected material field");
    }
    expect(field.value).toEqual({ material_id: "cotton", colors: ["red", "blue"] });
  });

  it("ignores material params that name no field", () => {
    const item = makeProduct({
      fields: [makeField({ name: "szin", type: "color", items: [{ value: "piros" }] })],
    });
    prefillFromParams(item, new URLSearchParams("m0=cotton&bogus_colors=red,blue"));
    expect(item.fields[0].value).toBeUndefined();
  });

  it("ignores unknown keys", () => {
    const item = makeProduct({ fields: [makeField({ name: "szin", type: "color" })] });
    prefillFromParams(item, new URLSearchParams("bogus=1&uuid=xyz"));
    expect(item.fields[0].value).toBeUndefined();
  });
});

describe("buildMaterialParams", () => {
  it("serialises material field selections by field name", () => {
    const item = makeProduct({
      fields: [
        makeField({
          name: "anyag",
          type: "material",
          value: { material_id: "cotton", colors: ["red", "blue"] },
        }),
      ],
    });
    const params = buildMaterialParams(item);
    expect(params.get("anyag")).toBe("cotton");
    expect(params.get("anyag_colors")).toBe("red,blue");
  });

  it("skips material fields without a selection", () => {
    const item = makeProduct({ fields: [makeField({ name: "anyag", type: "material" })] });
    expect(buildMaterialParams(item).toString()).toBe("");
  });

  it("round-trips through prefillFromParams", () => {
    const source = makeProduct({
      fields: [
        makeField({
          name: "anyag",
          type: "material",
          materials: [makeMaterial({ material_id: "cotton" })],
          value: { material_id: "cotton", colors: ["red", "blue"] },
        }),
      ],
    });
    const target = makeProduct({
      fields: [
        makeField({
          name: "anyag",
          type: "material",
          materials: [makeMaterial({ material_id: "cotton" })],
        }),
      ],
    });
    prefillFromParams(target, buildMaterialParams(source));
    const field = target.fields[0];
    if (field.type !== "material") {
      throw new Error("expected material field");
    }
    expect(field.value).toEqual({ material_id: "cotton", colors: ["red", "blue"] });
  });
});
