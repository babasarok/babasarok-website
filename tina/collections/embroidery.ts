import type { Collection } from "tinacms";
import { requiredListItemsBeforeSubmit } from "../lib/utils";

/**
 * Embroidery ("Hímzés") global settings — backs `src/content/config/embroidery.json`.
 *
 * Holds the shared thread-colour palette used by the `embroidery` product field
 * type. The `colors` shape mirrors `product_materials.colors` so the order
 * island can reuse the same colour components. A single global file, alongside
 * `config.json`; the two are kept apart by their `match.include` globs.
 */
export const EmbroideryConfigCollection: Collection = {
  name: "embroidery",
  label: "Hímzés beállítások",
  path: "src/content/config",
  format: "json",
  match: {
    include: "embroidery",
  },
  ui: {
    global: true,
    allowedActions: {
      create: false,
      delete: false,
    },
    beforeSubmit: requiredListItemsBeforeSubmit,
  },
  fields: [
    {
      type: "object",
      name: "colors",
      list: true,
      label: "Cérna színek",
      description: "A hímzéshez választható cérna színek.",
      ui: {
        itemProps: (item) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
          return { label: item?.label || "Új szín" };
        },
      },
      fields: [
        {
          type: "string",
          name: "color_id",
          description:
            "Egyedi! azonosító a színhez, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
          label: "Kód",
          required: true,
        },
        {
          type: "string",
          name: "label",
          description: "A szín neve, pl: Piros",
          label: "Név",
          required: true,
        },
        {
          type: "string",
          name: "hex",
          label: "Szín",
          description: "Megközelítőleges színe a cérnának. Ha nincs kitöltve, akkor kép legyen.",
          ui: {
            component: "color",
          },
        },
        {
          type: "image",
          name: "image",
          label: "Kép",
          description: "A szín képe. Ha nincs kitöltve, akkor szín legyen.",
        },
      ],
    },
  ],
};
