import type { Collection } from "tinacms";

/**
 * Landing-page product preview section. Backed by the per-locale
 * `src/content/sections/<locale>/product.json`. The `title` is a markdown
 * string rendered at build time with `astro-md-2`. Scoped to the single
 * `product` file per locale via `match`. The previewed products themselves
 * come from the Vendure catalog, not from here.
 */
export const ProductSectionCollection: Collection = {
  name: "productSection",
  label: "Termék szekció",
  path: "src/content/sections",
  format: "json",
  match: {
    include: "**/product",
  },

  ui: {
    global: true,
    allowedActions: {
      create: false,
      delete: false,
    },
  },

  fields: [
    {
      type: "boolean",
      name: "enable",
      label: "Megjelenítés",
    },
    {
      type: "string",
      name: "title",
      label: "Cím (markdown)",
      ui: { component: "textarea" },
    },
    {
      type: "number",
      name: "itemCount",
      label: "Megjelenített termékek száma",
    },
    {
      type: "string",
      name: "buttonName",
      label: "Gomb felirata",
    },
    {
      type: "string",
      name: "buttonTarget",
      label: "Gomb cél",
    },
  ],
};
