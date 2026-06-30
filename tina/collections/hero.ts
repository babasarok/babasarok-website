import type { Collection } from "tinacms";

/**
 * Landing-page hero section. Backed by `src/content/sections/hero.md`
 * (produced by the migration scripts): frontmatter holds the fields, the
 * markdown body is the headline + subtitle copy. Scoped to the single
 * `hero` file via `match`, so other section collections share the folder.
 */
export const HeroCollection: Collection = {
  name: "hero",
  label: "Hero szekció",
  path: "src/content/sections",
  format: "md",
  match: {
    include: "hero",
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
      name: "buttonName",
      label: "Gomb szöveg",
    },
    {
      type: "string",
      name: "buttonURL",
      label: "Gomb URL",
    },
    {
      type: "image",
      name: "image",
      label: "Hero kép",
    },
    {
      type: "rich-text",
      name: "body",
      label: "Tartalom",
      description: "Az első sor a főcím (H1), a többi alcímként jelenik meg.",
      isBody: true,
    },
  ],
};
