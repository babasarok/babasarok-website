import type { Collection } from "tinacms";

/**
 * Landing-page service ("Termék fajták") section. Backed by
 * `src/content/sections/service.json`. The `title` and each item's
 * `content` are markdown strings rendered at build time with `astro-md-2`,
 * mirroring Hugo's old `markdownify`. Scoped to the single `service` file
 * via `match` so other sections can share the folder.
 */
export const ServiceCollection: Collection = {
  name: "service",
  label: "Termék fajták szekció",
  path: "src/content/sections",
  format: "json",
  match: {
    include: "service",
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
      type: "object",
      name: "service",
      label: "Termékek",
      list: true,
      ui: {
        itemProps: (item) => ({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-member-access
          label: item?.content?.split("\n")[0]?.replace(/^#+\s*/, "") ?? "Termék",
        }),
      },
      fields: [
        {
          type: "string",
          name: "content",
          label: "Tartalom (markdown)",
          ui: { component: "textarea" },
        },
        {
          type: "image",
          name: "image",
          label: "Kép",
        },
      ],
    },
  ],
};
