import type { z } from "zod";

import { MaterialFieldSchema } from "../../../field-kinds/material";
import type { MaterialField } from "../../../field-kinds/material";

import type { TinaProductFieldSource } from "../source-types";
import { pushFieldDefinitionIssues, trimmedOptionalText, type FieldCompileIssue } from "./shared";

type MaterialColorCount = z.input<typeof MaterialFieldSchema>["colorCount"];

function compileColorCount(colorCount: string | null): MaterialColorCount {
  const source = trimmedOptionalText(colorCount);
  if (source === undefined) {
    return { kind: "fixed", count: 1 };
  }

  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(source)) {
    return { kind: "fixed", count: Number(source) };
  }

  return { kind: "from-field", fieldId: source };
}

export function compileMaterialField(
  source: TinaProductFieldSource,
  fieldId: string,
  issues: FieldCompileIssue[]
): MaterialField | undefined {
  const options = (source.materials ?? []).flatMap((member, index) => {
    if (member === null) {
      issues.push({
        code: "field.null-material",
        fieldId,
        path: ["materials", index],
        message: "A mező materials listája üres elemet tartalmaz.",
      });
      return [];
    }

    return [{ materialId: member.material_path.material_id.trim(), price: member.price }];
  });

  const tooltip = trimmedOptionalText(source.tooltip);

  const parsed = MaterialFieldSchema.safeParse({
    id: fieldId,
    label: source.label.trim(),
    kind: "material",
    options,
    colorCount: compileColorCount(source.color_count),
    ...(tooltip === undefined ? {} : { tooltip }),
  });

  if (!parsed.success) {
    pushFieldDefinitionIssues(parsed.error, fieldId, issues);
    return undefined;
  }

  return parsed.data;
}
