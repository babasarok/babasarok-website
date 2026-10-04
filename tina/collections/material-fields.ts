import type { Product_Materials } from "../__generated__/types";
import { defineAuthoringForm } from "../lib/define-authoring-form";
import {
  MaterialColorDefinitionSchema,
  MaterialDefinitionSchema,
} from "../../src/product-definition/material";

const materialColorAuthoring = defineAuthoringForm({
  schema: MaterialColorDefinitionSchema,
  fields: [
    {
      meaning: { kind: "canonical", property: "id" },
      field: {
        type: "string",
        name: "color_id",
        description:
          "Egyedi! azonosító a színhez/mintához, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
        label: "Kód",
        required: true,
        ui: {
          validate: (value: string, material: Product_Materials) => {
            const normalized = value.trim();
            const duplicates = material.colors?.filter(
              (color) => color?.color_id.trim() === normalized
            );

            if (duplicates && duplicates.length > 1) {
              return "Ez az azonosító már létezik a színek/minták között.";
            }
          },
        },
      },
    },
    {
      meaning: { kind: "canonical", property: "label" },
      field: {
        type: "string",
        name: "label",
        description: "A szín/minta neve, pl: Piros",
        label: "Név",
        required: true,
      },
    },
    {
      meaning: { kind: "canonical", property: "appearance" },
      field: {
        type: "string",
        name: "hex",
        label: "Kód",
        description: "Megközelítőleges színe az anyagnak. Ha nincs kitöltve, akkor kép legyen.",
        ui: {
          component: "color",
        },
      },
    },
    {
      meaning: { kind: "canonical", property: "appearance" },
      field: {
        type: "image",
        name: "image",
        label: "Kép",
        description: "A szín/minta képe. Ha nincs kitöltve, akkor szín legyen.",
      },
    },
  ],
});

export const materialAuthoring = defineAuthoringForm({
  schema: MaterialDefinitionSchema,
  fields: [
    {
      meaning: { kind: "canonical", property: "id" },
      field: {
        type: "string",
        name: "material_id",
        description:
          "Egyedi! azonosító az anyaghoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: anyag-1",
        label: "Anyag ID",
        required: true,
      },
    },
    {
      meaning: { kind: "canonical", property: "label" },
      field: {
        type: "string",
        name: "label",
        description: "Az anyag neve, pl: Velúr",
        label: "Név",
        required: true,
      },
    },
    {
      meaning: { kind: "canonical", property: "colors" },
      field: {
        type: "object",
        name: "colors",
        list: true,
        label: "Színek/minták",
        description: "A termékhez tartozó színek vagy minták.",
        ui: {
          itemProps: (item) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
            return { label: item?.label || "Új mező" };
          },
        },
        fields: materialColorAuthoring.fields,
      },
    },
    {
      meaning: { kind: "presentation" },
      field: {
        type: "image",
        name: "thumbnail",
        label: "Kép",
      },
    },
    {
      meaning: { kind: "presentation" },
      field: {
        type: "string",
        name: "categories",
        label: "Alcím",
      },
    },
    {
      meaning: { kind: "presentation" },
      field: {
        type: "string",
        name: "shortDescription",
        label: "Leírás",
        ui: {
          component: "textarea",
        },
      },
    },
    {
      meaning: { kind: "presentation" },
      field: {
        type: "rich-text",
        name: "content",
        label: "Tartalom",
        isBody: true,
      },
    },
  ],
});
