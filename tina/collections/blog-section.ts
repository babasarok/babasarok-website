import type { Collection } from "tinacms";

/**
 * Landing-page blog preview ("Referenciamunkák") section. Backed by
 * `src/content/sections/blog.json`. The `title` is a markdown string rendered
 * at build time with `astro-md-2`. Scoped to the single `blog` file via
 * `match`. The previewed posts themselves come from the `blog` content
 * collection, not from here.
 */
export const BlogSectionCollection: Collection = {
  name: "blogSection",
  label: "Blog szekció",
  path: "src/content/sections",
  format: "json",
  match: {
    include: "blog",
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
      name: "topTitle",
      label: "Felső cím",
    },
    {
      type: "string",
      name: "title",
      label: "Cím (markdown)",
      ui: { component: "textarea" },
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
