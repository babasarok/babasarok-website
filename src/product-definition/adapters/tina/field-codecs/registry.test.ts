import { describe, expect, it } from "vitest";

import { PRODUCT_FIELD_TYPE_VALUES } from "../../../../lib/product/fieldTypes";
import type { ProductFieldType } from "../../../../lib/product/fieldTypes";
import type { ProductField } from "../../../product";
import type { TinaProductFieldSource } from "../source-types";
import { CANONICAL_FIELD_KINDS, SOURCE_FIELD_CODECS, compileField } from "./registry";
import { createFieldSource, fieldItem, materialOption } from "./test-fixtures";

const fieldSource = createFieldSource({ name: "faj", label: "Faj", type: "input" });

const CHOICE_SOURCE_TYPES = new Set<ProductFieldType>(["select", "radio", "color"]);

const CANONICAL_KIND_BY_SOURCE: Record<ProductFieldType, ProductField["kind"]> = {
  input: "input",
  select: "choice",
  radio: "choice",
  color: "choice",
  material: "material",
  toggle: "toggle",
  embroidery: "embroidery",
};

function sourceFor(type: ProductFieldType): TinaProductFieldSource {
  if (type === "material") {
    return fieldSource({ type, materials: [materialOption("anyag-1", 0)] });
  }

  if (CHOICE_SOURCE_TYPES.has(type)) {
    return fieldSource({ type, items: [fieldItem("x")] });
  }

  return fieldSource({ type });
}

describe("compileField", () => {
  it("dispatches every source type to its canonical kind", () => {
    for (const type of PRODUCT_FIELD_TYPE_VALUES) {
      const result = compileField(sourceFor(type));
      if (!result.success) {
        throw new Error(`expected ${type} to compile: ${JSON.stringify(result)}`);
      }
      expect(result.value.kind).toBe(CANONICAL_KIND_BY_SOURCE[type]);
    }
  });

  it("returns an unknown-kind issue for an arbitrary source type", () => {
    expect(compileField(fieldSource({ type: "wackadoo" }))).toEqual({
      success: false,
      issues: [
        {
          code: "field.unknown-kind",
          fieldId: "faj",
          path: ["type"],
          message: 'Ismeretlen mező típus: "wackadoo".',
        },
      ],
    });
  });
});

describe("SOURCE_FIELD_CODECS", () => {
  it("covers every ProductFieldType exactly once", () => {
    expect(Object.keys(SOURCE_FIELD_CODECS).toSorted()).toEqual(
      [...PRODUCT_FIELD_TYPE_VALUES].toSorted()
    );
  });
});

describe("CANONICAL_FIELD_KINDS", () => {
  it("maps every canonical field kind onto all seven source types", () => {
    expect(Object.keys(CANONICAL_FIELD_KINDS).toSorted()).toEqual([
      "choice",
      "embroidery",
      "input",
      "material",
      "toggle",
    ]);
    expect(Object.values(CANONICAL_FIELD_KINDS).flat().toSorted()).toEqual(
      [...PRODUCT_FIELD_TYPE_VALUES].toSorted()
    );
  });
});
