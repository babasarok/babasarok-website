import type { Collection } from "tinacms";

/**
 * Delivery methods ("Szállítási módok") — backs
 * `src/content/delivery_method/*.md`. Referenced by the ordering flow; kept
 * editable in Tina so prices stay in sync.
 */
export const DeliveryMethodCollection: Collection = {
  name: "delivery_methods",
  label: "Szállítási módok",
  path: "src/content/delivery_method",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "**/*",
  },
  ui: {
    filename: {
      // optional: stop editors from typing the name freehand
      readonly: true,
      slugify: (values) => {
        const base = String(values?.delivery_name ?? "")
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
      name: "delivery_name",
      description:
        "Egyedi! azonosító a szállítási módhoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szallitas-1",
      label: "Szállítási mód ID",
      required: true,
    },
    {
      type: "string",
      name: "name",
      description:
        "A szállítási mód megjelenítendő neve, ami a felhasználó számára látható.",
      label: "Szállítási mód név",
      required: true,
    },
    {
      type: "number",
      name: "price",
      label: "Ár - Forintban",
      required: true,
    },
  ],
};
