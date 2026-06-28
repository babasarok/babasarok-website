import type { Collection } from "tinacms";

/**
 * Referenciamunkák (blog) — backs `src/content/blog/*.md`, the `/blog` list
 * page and the `/blog/[id]` single page. Ported from the old Hugo project's
 * `blog` collection. `_index.md` is excluded from the Astro glob but Tina
 * lists every entry; the single page reads `postImage` (falling back to
 * `featureImage`), `date`, `tags` and `categories`.
 */
export const BlogCollection: Collection = {
  name: "blog",
  label: "Referenciamunkák",
  path: "src/content/blog",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "**/*",
    exclude: "_index",
  },
  ui: {
    filename: {
      // optional: stop editors from typing the name freehand
      readonly: true,
      slugify: (values) => {
        const base = String(values?.title ?? "")
          .normalize("NFKD") // split accents from letters (á -> a +  ́)
          .replace(/[\u0300-\u036f]/g, "") // drop the accent marks
          .replace(/[^a-zA-Z0-9]+/g, "-") // non-ascii/alnum -> dash
          .replace(/^-+|-+$/g, "") // trim dashes
          .toLowerCase();
        return base || "untitled";
      },
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
      type: "datetime",
      name: "date",
      label: "Dátum",
    },
    {
      type: "image",
      name: "featureImage",
      label: "Kiemelt kép",
    },
    {
      type: "image",
      name: "postImage",
      label: "Bejegyzés kép (lehet ugyanaz, mint a kiemelt)",
    },
    {
      type: "string",
      name: "tags",
      label: "Tagek",
      list: true,
    },
    {
      type: "string",
      name: "categories",
      label: "Kategóriák",
    },
    {
      type: "rich-text",
      name: "content",
      label: "Tartalom",
      isBody: true,
    },
  ],
};
