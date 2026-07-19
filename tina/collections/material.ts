import type { Collection } from "tinacms";
import { requiredListItemsBeforeSubmit, slugify } from "../lib/utils";
import type { Product_Materials } from "../__generated__/types";

/**
 * Materials ("Anyagok") — backs `src/content/material/*.md` and also the
 * `/material` Astro list page. Named `product_materials` because the product
 * collection's `materials` and `banned_combinations` fields reference it.
 */
export const MaterialCollection: Collection = {
  name: "product_materials",
  label: "Anyagok",
  path: "src/content/material",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "**/*",
  },
  ui: {
    beforeSubmit: requiredListItemsBeforeSubmit,
    filename: {
      // optional: stop editors from typing the name freehand
      readonly: true,
      slugify: (values) => {
        const base = slugify(String(values.label ?? ""));
        return base || "untitled";
      },
    },
  },
  fields: [
    {
      type: "string",
      name: "material_id",
      description:
        "Egyedi! azonosító az anyaghoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: anyag-1",
      label: "Anyag ID",
      required: true,
    },
    {
      type: "string",
      name: "label",
      description: "Az anyag neve, pl: Velúr",
      label: "Név",
      required: true,
    },
    {
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
      fields: [
        {
          type: "string",
          name: "color_id",
          description:
            "Egyedi! azonosító a színhez/mintához, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
          label: "Kód",
          required: true,
          ui: {
            validate: (value: string, material: Product_Materials) => {
              const duplicates = material.colors?.filter((color) => color?.color_id === value);

              if (duplicates && duplicates.length > 1) {
                return "Ez az azonosító már létezik a színek/minták között.";
              }
            },
          },
        },
        {
          type: "string",
          name: "label",
          description: "A szín/minta neve, pl: Piros",
          label: "Név",
          required: true,
        },
        {
          type: "string",
          name: "hex",
          label: "Kód",
          description: "Megközelítőleges színe az anyagnak. Ha nincs kitöltve, akkor kép legyen.",
          ui: {
            component: "color",
          },
        },
        {
          type: "image",
          name: "image",
          label: "Kép",
          description: "A szín/minta képe. Ha nincs kitöltve, akkor szín legyen.",
        },
      ],
    },
    {
      type: "image",
      name: "thumbnail",
      label: "Kép",
    },
    {
      type: "string",
      name: "categories",
      label: "Alcím",
    },
    {
      type: "string",
      name: "shortDescription",
      label: "Leírás",
      ui: {
        component: "textarea",
      },
    },
    {
      type: "rich-text",
      name: "content",
      label: "Tartalom",
      isBody: true,
    },
  ],
};
