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
