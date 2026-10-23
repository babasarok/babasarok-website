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
      name: "cookieBannerHeading",
      label: "Cookie sáv címe",
      required: true,
    },
    {
      type: "string",
      name: "cookieBannerText",
      label: "Cookie sáv szövege",
      required: true,
    },
    {
      type: "object",
      name: "cookieCategories",
      label: "Cookie kategóriák",
      list: true,
      fields: [
        {
          type: "string",
          name: "key",
          label: "Kulcs",
          required: true,
          options: [
            { value: "necessary", label: "Necessary" },
            { value: "analytics", label: "Analytics" },
            { value: "marketing", label: "Marketing" },
          ],
        },
        {
          type: "string",
          name: "label",
          label: "Címke",
          required: true,
        },
        {
          type: "string",
          name: "description",
          label: "Leírás",
          required: true,
        },
        {
          type: "boolean",
          name: "locked",
          label: "Zárt (nem kapcsolható)",
          required: true,
        },
        {
          type: "object",
          name: "cookies",
          label: "Cookie-k",
          list: true,
          fields: [
            {
              type: "string",
              name: "name",
              label: "Név",
              required: true,
            },
            {
              type: "string",
              name: "domain",
              label: "Domain",
              required: true,
            },
            {
              type: "string",
              name: "lifetime",
              label: "Tárolási idő",
              required: true,
            },
          ],
        },
      ],
    },
    {
      type: "rich-text",
      name: "content",
      label: "Tartalom",
      isBody: true,
    },
  ],
};
