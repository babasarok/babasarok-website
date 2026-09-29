import type { Collection } from "tinacms";
import { requiredListItemsBeforeSubmit, slugify } from "../lib/utils";

export const ProductGroupCollection: Collection = {
  name: "product_groups",
  label: "Termékcsoportok",
  path: "src/content/product_groups",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "**/*",
  },
  ui: {
    beforeSubmit: requiredListItemsBeforeSubmit,
    filename: {
      // optional: stop editors from typing the name freehand
      readonly: true,
      slugify: (values) => {
        const base = slugify(String(values.title ?? ""));
        return base || "untitled";
      },
    },
  },
  fields: [
    {
      isTitle: true,
      type: "string",
      name: "title",
      label: "Csoport neve",
      description: "A termékcsoport neve.",
      required: true,
    },
    {
      type: "number",
      name: "discount_amount",
      label: "Szett kedvezmény (Ft)",
      description:
        "Opcionális fix forint kedvezmény, amit a szett minden összeálló példánya egyszer kap, ha a tagjait együtt rendelik. 0 vagy üres érték esetén a csoport nem ad kedvezményt (kapcsolódó termékként jelenik meg). Ha egy termék több szettben is szerepel, a legnagyobb kedvezményt adó szett érvényesül.",
      ui: {
        validate: (value?: number) => {
          if (value != null && (value < 0 || !Number.isInteger(value))) {
            return "A kedvezménynek 0 vagy annál nagyobb egész számnak kell lennie.";
          }
        },
      },
    },
    {
      type: "object",
      name: "products",
      list: true,
      label: "Termékek",
      description: "A termékek listája.",
      ui: {
        itemProps: (item) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
          return { label: item?.product || "Új termék" };
        },
      },
      fields: [
        {
          type: "reference",
          collections: ["product"],
          name: "product",
          label: "Termék",
          description: "A termék, amelyet a csoporthoz adunk.",
          required: true,
        },
      ],
    },
    {
      type: "rich-text",
      name: "body",
      label: "Leírás",
      description:
        "Opcionális leírás/tartalom a szetthez. Jelenleg nem jelenik meg, de megőrizzük későbbi megjelenítéshez.",
      isBody: true,
    },
  ],
};
