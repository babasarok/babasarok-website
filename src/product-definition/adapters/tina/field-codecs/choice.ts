import type { z } from "zod";

import { ChoiceFieldSchema } from "../../../field-kinds/choice";
import type { ChoiceField } from "../../../field-kinds/choice";

import type { TinaProductFieldSource } from "../source-types";
import {
  compileVisibility,
  pushFieldDefinitionIssues,
  trimmedOptionalText,
  type FieldCompileIssue,
} from "./shared";

type ChoiceCustomValue = NonNullable<z.input<typeof ChoiceFieldSchema>["customValue"]>;

function compileCustomValue(
  allowCustomValue: boolean | null,
  regex: string | null,
  placeholder: string | null
): ChoiceCustomValue | undefined {
  if (allowCustomValue !== true) {
    return undefined;
  }

  const pattern = trimmedOptionalText(regex);
  const trimmedPlaceholder = trimmedOptionalText(placeholder);
  if (pattern === undefined && trimmedPlaceholder === undefined) {
    return {};
  }

  return {
    ...(pattern === undefined ? {} : { pattern }),
    ...(trimmedPlaceholder === undefined ? {} : { placeholder: trimmedPlaceholder }),
  };
}

export function compileChoiceField(
  source: TinaProductFieldSource,
  fieldId: string,
  issues: FieldCompileIssue[],
  presentation: "select" | "radio" | "color"
): ChoiceField | undefined {
  const options = (source.items ?? []).flatMap((item, index) => {
    if (item === null) {
      issues.push({
        code: "field.null-item",
        fieldId,
        path: ["items", index],
        message: "A mező items listája üres elemet tartalmaz.",
      });
      return [];
    }

    const id = item.value.trim();
    const tooltip = trimmedOptionalText(item.tooltip);
    return [
      {
        id,
        label: trimmedOptionalText(item.label) ?? id,
        price: item.price ?? 0,
        ...(tooltip === undefined ? {} : { tooltip }),
      },
    ];
  });

  const tooltip = trimmedOptionalText(source.tooltip);
  const customValue = compileCustomValue(
    source.allow_custom_value,
    source.regex,
    source.placeholder
  );

  const parsed = ChoiceFieldSchema.safeParse({
    id: fieldId,
    label: source.label.trim(),
    kind: "choice",
    presentation,
    price: source.price ?? 0,
    visibility: compileVisibility(source.depends_on),
    options,
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(customValue === undefined ? {} : { customValue }),
  });

  if (!parsed.success) {
    pushFieldDefinitionIssues(parsed.error, fieldId, issues);
    return undefined;
  }

  return parsed.data;
}
