import type { Collection } from "tinacms";

export const CheckoutCollection: Collection = {
  name: "checkout",
  label: "Rendelés",
  path: "src/content/checkout",
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
      name: "basket_note",
      label: "Kosár megjegyzés",
      required: false,
    },
  ],
};
