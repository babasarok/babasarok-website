import type { Collection } from "tinacms";

/**
 * Rendelés (Kapcsolat) — backs `src/content/contact/_index.md` and the
 * `/contact` page. Ported from the old Hugo project's `contact` collection,
 * extended with the `title` + `breadcrumb` frontmatter the Astro page renders
 * (the old template only modelled the markdown body). Single-file collection,
 * so create/delete are disabled.
 */
export const ContactCollection: Collection = {
  name: "contact",
  label: "Rendelés (Kapcsolat)",
  path: "src/content/contact",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "_index",
  },
  ui: {
    allowedActions: {
      create: false,
      delete: false,
    },
  },
  fields: [
    {
      type: "string",
      name: "title",
      label: "Cím",
      required: true,
    },
    {
      type: "string",
      name: "breadcrumb",
      label: "Morzsamenü felirat",
    },
    {
      type: "rich-text",
      name: "content",
      label: "Tartalom",
      isBody: true,
    },
  ],
};
