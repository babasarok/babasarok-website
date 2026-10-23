import type { Collection } from "tinacms";
import { requiredListItemsBeforeSubmit, slugify } from "../lib/utils";
import { materialAuthoring } from "./material-fields";

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
  fields: materialAuthoring.fields,
};
