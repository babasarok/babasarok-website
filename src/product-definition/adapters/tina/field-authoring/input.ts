import { defineAuthoringForm } from "../../../../../tina/lib/define-authoring-form";
import { InputFieldSchema } from "../../../field-kinds/input";
import {
  fieldIdField,
  fieldItemsField,
  fieldLabelField,
  fieldPatternField,
  fieldPlaceholderField,
  fieldPriceField,
  fieldTooltipField,
  fieldTypeField,
  fieldVisibilityField,
} from "./shared";

export const inputFieldAuthoring = defineAuthoringForm({
  schema: InputFieldSchema,
  fields: [
    { meaning: { kind: "canonical", property: "id" }, field: fieldIdField },
    { meaning: { kind: "canonical", property: "label" }, field: fieldLabelField },
    { meaning: { kind: "canonical", property: "kind" }, field: fieldTypeField },
    { meaning: { kind: "canonical", property: "price" }, field: fieldPriceField },
    {
      meaning: { kind: "canonical", property: "required" },
      field: {
        type: "boolean",
        name: "optional",
        label: "Opcionális mező",
        description: "Jelzi, hogy a mező opcionális-e.",
      },
    },
    { meaning: { kind: "canonical", property: "tooltip" }, field: fieldTooltipField },
    { meaning: { kind: "canonical", property: "suggestions" }, field: fieldItemsField },
    { meaning: { kind: "canonical", property: "pattern" }, field: fieldPatternField },
    { meaning: { kind: "canonical", property: "placeholder" }, field: fieldPlaceholderField },
    { meaning: { kind: "canonical", property: "visibility" }, field: fieldVisibilityField },
  ],
});
