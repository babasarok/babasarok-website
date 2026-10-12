import { defineAuthoringForm } from "../../../../../tina/lib/define-authoring-form";
import { EMBROIDERY_PRICE_UNITS } from "../../../../lib/product/fieldTypes";
import { EmbroideryFieldSchema } from "../../../field-kinds/embroidery";
import {
  fieldIdField,
  fieldLabelField,
  fieldPatternField,
  fieldPlaceholderField,
  fieldPriceField,
  fieldTooltipField,
  fieldTypeField,
  fieldVisibilityField,
} from "./shared";

export const embroideryFieldAuthoring = defineAuthoringForm({
  schema: EmbroideryFieldSchema,
  fields: [
    { meaning: { kind: "canonical", property: "id" }, field: fieldIdField },
    { meaning: { kind: "canonical", property: "label" }, field: fieldLabelField },
    { meaning: { kind: "canonical", property: "kind" }, field: fieldTypeField },
    { meaning: { kind: "canonical", property: "pricing" }, field: fieldPriceField },
    {
      meaning: { kind: "canonical", property: "pricing" },
      field: {
        type: "string",
        name: "price_unit",
        label: "Árazás módja",
        description:
          "Hímzésnél: fix ár vagy szavankénti ár. A mező ára az itt választott egységre vonatkozik.",
        options: EMBROIDERY_PRICE_UNITS.map(({ value, label }) => ({ value, label })),
      },
    },
    { meaning: { kind: "canonical", property: "tooltip" }, field: fieldTooltipField },
    { meaning: { kind: "canonical", property: "pattern" }, field: fieldPatternField },
    { meaning: { kind: "canonical", property: "placeholder" }, field: fieldPlaceholderField },
    { meaning: { kind: "canonical", property: "visibility" }, field: fieldVisibilityField },
  ],
});
