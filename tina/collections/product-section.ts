import type { Collection } from "tinacms";

/**
 * Landing-page product ("Legnépszerűbb Termékeink") section config. Backed by
 * `src/content/sections/product.json`. Only holds the section heading + button
 * + how many products to show; the products themselves come from the Astro
 * `product` content collection. Scoped to the single `product` file via `match`.
 */
export const ProductSectionCollection: Collection = {
  name: "productSection",
  label: "Termékek szekció",
  path: "src/content/sections",
  format: "json",
  match: {
    include: "product",
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
