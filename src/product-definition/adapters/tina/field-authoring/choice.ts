import { defineAuthoringForm } from "../../../../../tina/lib/define-authoring-form";
import { ChoiceFieldSchema } from "../../../field-kinds/choice";
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

export const choiceFieldAuthoring = defineAuthoringForm({
  schema: ChoiceFieldSchema,
  fields: [
    { meaning: { kind: "canonical", property: "id" }, field: fieldIdField },
    { meaning: { kind: "canonical", property: "label" }, field: fieldLabelField },
    {
      meaning: { kind: "canonical", property: ["kind", "presentation"] },
      field: fieldTypeField,
    },
    { meaning: { kind: "canonical", property: "price" }, field: fieldPriceField },
    { meaning: { kind: "canonical", property: "tooltip" }, field: fieldTooltipField },
    { meaning: { kind: "canonical", property: "options" }, field: fieldItemsField },
    {
      meaning: { kind: "canonical", property: "customValue" },
      field: {
        type: "boolean",
        name: "allow_custom_value",
        label: "Egyedi érték engedélyezése",
        description: "Ha engedélyezve van, a felhasználó egyedi értéket is megadhat a mezőhöz.",
      },
    },
    { meaning: { kind: "canonical", property: "customValue" }, field: fieldPatternField },
    { meaning: { kind: "canonical", property: "customValue" }, field: fieldPlaceholderField },
    { meaning: { kind: "canonical", property: "visibility" }, field: fieldVisibilityField },
  ],
});
