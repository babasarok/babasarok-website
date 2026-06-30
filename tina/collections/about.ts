import type { Collection } from "tinacms";

/**
 * Landing-page about ("Rólunk") section. Backed by
 * `src/content/sections/about.json`. The `title` and `content` are markdown
 * strings rendered at build time with `astro-md-2`, mirroring Hugo's old
 * `markdownify`. Scoped to the single `about` file via `match`.
 */
export const AboutCollection: Collection = {
  name: "about",
  label: "Rólunk szekció",
  path: "src/content/sections",
  format: "json",
  match: {
    include: "about",
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
      type: "string",
      name: "content",
      label: "Tartalom (markdown)",
      ui: { component: "textarea" },
    },
    {
      type: "string",
      name: "button1Name",
      label: "Első gomb felirata",
    },
    {
      type: "string",
      name: "button1Target",
      label: "Első gomb cél",
    },
    {
      type: "string",
      name: "button2Name",
      label: "Második gomb felirata",
    },
    {
      type: "string",
      name: "button2Target",
      label: "Második gomb cél",
    },
    {
      type: "image",
      name: "image",
      label: "Kép",
    },
  ],
};
