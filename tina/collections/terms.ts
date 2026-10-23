import type { Collection } from "tinacms";

/**
 * ÁSZF — backs `src/content/terms/index.md` and the `/terms` page. Single-file
 * collection, so create/delete are disabled. The "Megvásárolható termékek
 * listája" block at the end of the page is rendered from the product
 * collection, not from this body.
 */
export const TermsCollection: Collection = {
  name: "terms",
  label: "ÁSZF",
  path: "src/content/terms",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "index",
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
      type: "rich-text",
      name: "content",
      label: "Tartalom",
      isBody: true,
    },
  ],
};
