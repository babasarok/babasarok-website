import { InputFieldSchema } from "../../../field-kinds/input";
import type { InputField } from "../../../field-kinds/input";

import type { TinaProductFieldSource } from "../source-types";
import {
  compileVisibility,
  pushFieldDefinitionIssues,
  trimmedOptionalText,
  type FieldCompileIssue,
} from "./shared";

export function compileInputField(
  source: TinaProductFieldSource,
  fieldId: string,
  issues: FieldCompileIssue[]
): InputField | undefined {
  const suggestions = (source.items ?? []).flatMap((item, index) => {
    if (item === null) {
      issues.push({
        code: "field.null-item",
        fieldId,
        path: ["items", index],
        message: "A mező items listája üres elemet tartalmaz.",
      });
      return [];
    }

    const value = item.value.trim();
    return [{ value, label: trimmedOptionalText(item.label) ?? value }];
  });

  const tooltip = trimmedOptionalText(source.tooltip);
  const placeholder = trimmedOptionalText(source.placeholder);
  const pattern = trimmedOptionalText(source.regex);

  const parsed = InputFieldSchema.safeParse({
    id: fieldId,
    label: source.label.trim(),
    kind: "input",
    visibility: compileVisibility(source.depends_on),
    required: !source.optional,
    price: source.price ?? 0,
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(suggestions.length === 0 ? {} : { suggestions }),
  });

  if (!parsed.success) {
    pushFieldDefinitionIssues(parsed.error, fieldId, issues);
    return undefined;
  }

  return parsed.data;
}
