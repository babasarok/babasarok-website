import type { TinaField } from "tinacms";
import { describe, expect, it } from "vitest";
import { FIELD_AUTHORING } from "./field-authoring/registry";
import { productGroupAuthoring, validateProductGroupDiscount } from "./product-group-authoring";

type FieldMetadata = {
  type: string;
  name: string;
  label?: string | boolean;
  description?: string;
  required?: boolean;
  list?: boolean;
  isTitle?: boolean;
  isBody?: boolean;
  options?: unknown;
  collections?: string[];
  fields?: FieldMetadata[];
};

function fieldMetadata(field: TinaField): FieldMetadata {
  const fields =
    "fields" in field && Array.isArray(field.fields) ? field.fields.map(fieldMetadata) : undefined;
  const options = "options" in field ? field.options : undefined;
  const collections = "collections" in field ? field.collections : undefined;
  const isTitle = "isTitle" in field ? field.isTitle : undefined;
  const isBody = "isBody" in field ? field.isBody : undefined;

  return {
    type: field.type,
    name: field.name,
    ...(field.label === undefined ? {} : { label: field.label }),
    ...(field.description === undefined ? {} : { description: field.description }),
    ...(field.required === undefined ? {} : { required: field.required }),
    ...(field.list === undefined ? {} : { list: field.list }),
    ...(isTitle === undefined ? {} : { isTitle }),
    ...(isBody === undefined ? {} : { isBody }),
    ...(options === undefined ? {} : { options }),
    ...(collections === undefined ? {} : { collections }),
    ...(fields === undefined ? {} : { fields }),
  };
}

describe("FIELD_AUTHORING", () => {
  it("covers every canonical field kind", () => {
    expect(Object.keys(FIELD_AUTHORING)).toEqual([
      "input",
      "choice",
      "toggle",
      "material",
      "embroidery",
    ]);
  });

  it("declares the Tina source fields owned by each canonical kind", () => {
    expect(
      Object.fromEntries(
        Object.entries(FIELD_AUTHORING).map(([kind, authoring]) => [
          kind,
          authoring.fields.map(({ name }) => name),
        ])
      )
    ).toMatchInlineSnapshot(`
      {
        "choice": [
          "name",
          "label",
          "type",
          "price",
          "tooltip",
          "items",
          "allow_custom_value",
          "regex",
          "placeholder",
          "depends_on",
        ],
        "embroidery": [
          "name",
          "label",
          "type",
          "price",
          "price_unit",
          "tooltip",
          "regex",
          "placeholder",
          "depends_on",
        ],
        "input": [
          "name",
          "label",
          "type",
          "price",
          "optional",
          "tooltip",
          "items",
          "regex",
          "placeholder",
          "depends_on",
        ],
        "material": [
          "name",
          "label",
          "type",
          "color_count",
          "materials",
        ],
        "toggle": [
          "name",
          "label",
          "type",
          "price",
          "tooltip",
          "depends_on",
        ],
      }
    `);
  });
});

describe("productGroupAuthoring", () => {
  it("declares Product-group and Product-reference metadata independently", () => {
    expect(productGroupAuthoring.fields.map(fieldMetadata)).toMatchInlineSnapshot(`
      [
        {
          "description": "Egyedi azonosító a termékcsoporthoz. Létrehozás után ne változtasd meg.",
          "label": "Termékcsoport ID",
          "name": "product_group_id",
          "required": true,
          "type": "string",
        },
        {
          "description": "A termékcsoport neve.",
          "isTitle": true,
          "label": "Csoport neve",
          "name": "title",
          "required": true,
          "type": "string",
        },
        {
          "description": "Opcionális fix forint kedvezmény, amit a szett minden összeálló példánya egyszer kap, ha a tagjait együtt rendelik. 0 vagy üres érték esetén a csoport nem ad kedvezményt (kapcsolódó termékként jelenik meg). Ha egy termék több szettben is szerepel, a legnagyobb kedvezményt adó szett érvényesül.",
          "label": "Szett kedvezmény (Ft)",
          "name": "discount_amount",
          "type": "number",
        },
        {
          "description": "A termékek listája.",
          "fields": [
            {
              "collections": [
                "product",
              ],
              "description": "A termék, amelyet a csoporthoz adunk.",
              "label": "Termék",
              "name": "product",
              "required": true,
              "type": "reference",
            },
          ],
          "label": "Termékek",
          "list": true,
          "name": "products",
          "type": "object",
        },
        {
          "description": "Opcionális leírás/tartalom a szetthez. Jelenleg nem jelenik meg, de megőrizzük későbbi megjelenítéshez.",
          "isBody": true,
          "label": "Leírás",
          "name": "body",
          "type": "rich-text",
        },
      ]
    `);
  });

  it.each([undefined, 0, 1000])("accepts valid discount %s", (value) => {
    expect(validateProductGroupDiscount(value)).toBeUndefined();
  });

  it.each([-1, 1.5])("rejects invalid discount %s", (value) => {
    expect(validateProductGroupDiscount(value)).toBe(
      "A kedvezménynek 0 vagy annál nagyobb egész számnak kell lennie."
    );
  });
});
