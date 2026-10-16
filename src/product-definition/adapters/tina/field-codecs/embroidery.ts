import { EmbroideryFieldSchema } from "../../../field-kinds/embroidery";
import type { EmbroideryField } from "../../../field-kinds/embroidery";

import type { TinaProductFieldSource } from "../source-types";
import {
  compileVisibility,
  pushFieldDefinitionIssues,
  trimmedOptionalText,
  type FieldCompileIssue,
} from "./shared";

export function compileEmbroideryField(
  source: TinaProductFieldSource,
  fieldId: string,
  issues: FieldCompileIssue[]
): EmbroideryField | undefined {
  const price = source.price ?? 0;
  const tooltip = trimmedOptionalText(source.tooltip);
  const placeholder = trimmedOptionalText(source.placeholder);
  const pattern = trimmedOptionalText(source.regex);

  const parsed = EmbroideryFieldSchema.safeParse({
    id: fieldId,
    label: source.label.trim(),
    kind: "embroidery",
    visibility: compileVisibility(source.depends_on),
    pricing:
      source.price_unit === "word"
        ? { kind: "per-word", pricePerWord: price }
        : { kind: "flat", price },
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(pattern === undefined ? {} : { pattern }),
  });

  if (!parsed.success) {
    pushFieldDefinitionIssues(parsed.error, fieldId, issues);
    return undefined;
  }

  return parsed.data;
}
