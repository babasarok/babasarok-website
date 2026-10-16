import type { TinaField } from "tinacms";
import { defineAuthoringForm } from "../../../../../tina/lib/define-authoring-form";
import { MaterialFieldSchema } from "../../../field-kinds/material";
import { fieldIdField, fieldLabelField, fieldTypeField } from "./shared";

const materialOptionsField = {
  type: "object",
  name: "materials",
  label: "Anyag lista",
  description:
    "A mezőhöz rendelt anyagok listája. Ha nincs egy se hozzáadva, akkor nem lesz anyag kiválasztási lehetőség.",
  list: true,
  ui: {
    itemProps: (item: { material_path?: string | null }) => ({
      label: item.material_path || "Új anyag",
    }),
    defaultItem: { material_path: "", price: 0 },
  },
  fields: [
    {
      type: "reference",
      name: "material_path",
      label: "Anyag",
      description: "Válassz egy anyagot a listából.",
      collections: ["product_materials"],
      required: true,
    },
    {
      type: "number",
      name: "price",
      label: "Ár",
      description:
        "Az anyag ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni. Ha nincs megadva akkor 0.",
      required: true,
    },
  ],
} satisfies TinaField;

export const materialFieldAuthoring = defineAuthoringForm({
  schema: MaterialFieldSchema,
  fields: [
    { meaning: { kind: "canonical", property: "id" }, field: fieldIdField },
    { meaning: { kind: "canonical", property: "label" }, field: fieldLabelField },
    { meaning: { kind: "canonical", property: "kind" }, field: fieldTypeField },
    {
      meaning: { kind: "canonical", property: "colorCount" },
      field: {
        type: "string",
        name: "color_count",
        label: "Választható színek/minták száma",
        description:
          "Hány színt/választást kell tenni az anyagból. Alapértelmezetten 1. Ha egy másik mező adja a számot, írd be a Mező ID-ját (a mezőnek számértékűnek kell lennie).",
      },
    },
    { meaning: { kind: "canonical", property: "options" }, field: materialOptionsField },
  ],
});
