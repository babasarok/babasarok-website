import type { Collection } from "tinacms";

/**
 * Adatvédelmi tájékoztató — backs `src/content/adatvedelem/_index.md` and the
 * `/adatvedelem` page. Single-file collection, so create/delete are disabled.
 * Section 1 of the page (the data controller's address) is rendered by the
 * page from the site config, not from this body.
 */
export const AdatvedelemCollection: Collection = {
  name: "adatvedelem",
  label: "Adatvédelem",
  path: "src/content/adatvedelem",
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
      name: "cookieBannerText",
      label: "Cookie sáv szövege",
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
