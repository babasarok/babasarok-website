import { ToggleFieldSchema } from "../../../field-kinds/toggle";
import type { ToggleField } from "../../../field-kinds/toggle";

import type { TinaProductFieldSource } from "../source-types";
import {
  compileVisibility,
  pushFieldDefinitionIssues,
  trimmedOptionalText,
  type FieldCompileIssue,
} from "./shared";

export function compileToggleField(
  source: TinaProductFieldSource,
  fieldId: string,
  issues: FieldCompileIssue[]
): ToggleField | undefined {
  const tooltip = trimmedOptionalText(source.tooltip);

  const parsed = ToggleFieldSchema.safeParse({
    id: fieldId,
    label: source.label.trim(),
    kind: "toggle",
    visibility: compileVisibility(source.depends_on),
    price: source.price ?? 0,
    ...(tooltip === undefined ? {} : { tooltip }),
  });

  if (!parsed.success) {
    pushFieldDefinitionIssues(parsed.error, fieldId, issues);
    return undefined;
  }

  return parsed.data;
}
