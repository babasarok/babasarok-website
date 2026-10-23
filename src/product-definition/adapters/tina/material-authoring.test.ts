import type { Product_MaterialsColors } from "../../../../tina/__generated__/types";
import {
  duplicateColorIdMessage,
  materialAuthoring,
} from "../../../../tina/collections/material-fields";
import type { TinaField } from "tinacms";
import { MaterialDefinitionSchema } from "../../material";
import { describe, expect, it } from "vitest";

type ProjectedUi = {
  component?: string;
  itemProps: boolean;
  validate: boolean;
};

type ProjectedField = {
  type: string;
  name: string;
  label?: string | boolean;
  description?: string;
  required?: boolean;
  list?: boolean;
  isBody?: boolean;
  ui?: ProjectedUi;
  fields?: ProjectedField[];
};

function projectUi(ui: TinaField["ui"]): ProjectedUi | undefined {
  if (ui === undefined) {
    return undefined;
  }

  const component = typeof ui.component === "string" ? ui.component : undefined;

  return {
    ...(component === undefined ? {} : { component }),
    itemProps: "itemProps" in ui && typeof ui.itemProps === "function",
    validate: "validate" in ui && typeof ui.validate === "function",
  };
}

function projectField(field: TinaField): ProjectedField {
  const isBody = "isBody" in field ? field.isBody : undefined;
  const ui = projectUi(field.ui);
  const fields =
    "fields" in field && Array.isArray(field.fields) ? field.fields.map(projectField) : undefined;

  return {
    type: field.type,
    name: field.name,
    ...(field.label === undefined ? {} : { label: field.label }),
    ...(field.description === undefined ? {} : { description: field.description }),
    ...(field.required === undefined ? {} : { required: field.required }),
    ...(field.list === undefined ? {} : { list: field.list }),
    ...(isBody === undefined ? {} : { isBody }),
    ...(ui === undefined ? {} : { ui }),
    ...(fields === undefined ? {} : { fields }),
  };
}

describe("materialAuthoring", () => {
  it("pairs the canonical Material schema with the generated Tina fields", () => {
    expect(materialAuthoring.schema).toBe(MaterialDefinitionSchema);
  });

  it("exposes the complete Material form metadata without callback identities", () => {
    expect(materialAuthoring.fields.map(projectField)).toMatchInlineSnapshot(`
      [
        {
          "description": "Egyedi! azonosító az anyaghoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: anyag-1",
          "label": "Anyag ID",
          "name": "material_id",
          "required": true,
          "type": "string",
        },
        {
          "description": "Az anyag neve, pl: Velúr",
          "label": "Név",
          "name": "label",
          "required": true,
          "type": "string",
        },
        {
          "description": "A termékhez tartozó színek vagy minták.",
          "fields": [
            {
              "description": "Egyedi! azonosító a színhez/mintához, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
              "label": "Kód",
              "name": "color_id",
              "required": true,
              "type": "string",
              "ui": {
                "itemProps": false,
                "validate": true,
              },
            },
            {
              "description": "A szín/minta neve, pl: Piros",
              "label": "Név",
              "name": "label",
              "required": true,
              "type": "string",
            },
            {
              "description": "Megközelítőleges színe az anyagnak. Ha nincs kitöltve, akkor kép legyen.",
              "label": "Kód",
              "name": "hex",
              "type": "string",
              "ui": {
                "component": "color",
                "itemProps": false,
                "validate": false,
              },
            },
            {
              "description": "A szín/minta képe. Ha nincs kitöltve, akkor szín legyen.",
              "label": "Kép",
              "name": "image",
              "type": "image",
            },
          ],
          "label": "Színek/minták",
          "list": true,
          "name": "colors",
          "type": "object",
          "ui": {
            "itemProps": true,
            "validate": false,
          },
        },
        {
          "label": "Kép",
          "name": "thumbnail",
          "type": "image",
        },
        {
          "label": "Alcím",
          "name": "categories",
          "type": "string",
        },
        {
          "label": "Leírás",
          "name": "shortDescription",
          "type": "string",
          "ui": {
            "component": "textarea",
            "itemProps": false,
            "validate": false,
          },
        },
        {
          "isBody": true,
          "label": "Tartalom",
          "name": "content",
          "type": "rich-text",
        },
      ]
    `);
  });

  it("labels color list items from the authored label", () => {
    const colorsField = materialAuthoring.fields.find((field) => field.name === "colors");
    if (colorsField?.type !== "object") {
      throw new Error("Missing Material colors itemProps");
    }
    const ui = colorsField.ui;
    if (ui === undefined || !("itemProps" in ui) || typeof ui.itemProps !== "function") {
      throw new Error("Missing Material colors itemProps");
    }

    expect(ui.itemProps({ label: "Fehér" })).toEqual({ label: "Fehér" });
    expect(ui.itemProps({ label: "" })).toEqual({ label: "Új mező" });
    expect(ui.itemProps({})).toEqual({ label: "Új mező" });
  });
});

describe("duplicateColorIdMessage", () => {
  const color = (color_id: string, label: string): Product_MaterialsColors => ({
    __typename: "Product_materialsColors",
    color_id,
    label,
    hex: null,
    image: null,
  });

  it("detects duplicate ids after trimming", () => {
    expect(
      duplicateColorIdMessage(" feher", [color("feher", "Fehér"), color(" feher ", "Fehér 2")])
    ).toBe("Ez az azonosító már létezik a színek/minták között.");
  });

  it("permits a unique id", () => {
    expect(duplicateColorIdMessage("mintas", [color("feher", "Fehér")])).toBeUndefined();
  });

  it("permits an id when no color list is available", () => {
    expect(duplicateColorIdMessage("feher", null)).toBeUndefined();
    expect(duplicateColorIdMessage("feher", [])).toBeUndefined();
  });
});
