import { defineAuthoringForm } from "../../../../../tina/lib/define-authoring-form";
import { ToggleFieldSchema } from "../../../field-kinds/toggle";
import {
  fieldIdField,
  fieldLabelField,
  fieldPriceField,
  fieldTooltipField,
  fieldTypeField,
  fieldVisibilityField,
} from "./shared";

export const toggleFieldAuthoring = defineAuthoringForm({
  schema: ToggleFieldSchema,
  fields: [
    { meaning: { kind: "canonical", property: "id" }, field: fieldIdField },
    { meaning: { kind: "canonical", property: "label" }, field: fieldLabelField },
    { meaning: { kind: "canonical", property: "kind" }, field: fieldTypeField },
    { meaning: { kind: "canonical", property: "price" }, field: fieldPriceField },
    { meaning: { kind: "canonical", property: "tooltip" }, field: fieldTooltipField },
    { meaning: { kind: "canonical", property: "visibility" }, field: fieldVisibilityField },
  ],
});
