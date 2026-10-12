import type { z } from "zod";

import type { CompileResult } from "../../../authoring/result";
import type { FieldVisibilitySchema } from "../../../field";
import type { ProductField } from "../../../product";
import type { TinaProductFieldDependencySource, TinaProductFieldSource } from "../source-types";

type FieldVisibilityInput = z.input<typeof FieldVisibilitySchema>;

export type FieldCompileIssue = {
  code:
    "field.unknown-kind" | "field.null-item" | "field.null-material" | "field.definition-invalid";
  fieldId: string;
  path: Array<string | number>;
  message: string;
};

export type FieldCompileResult = CompileResult<ProductField, FieldCompileIssue>;

export type SourceFieldKindCodec = (
  source: TinaProductFieldSource,
  fieldId: string,
  issues: FieldCompileIssue[]
) => ProductField | undefined;

export function trimmedOptionalText(text: string | null): string | undefined {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
}

export function compileVisibility(
  dependsOn: TinaProductFieldDependencySource | null
): FieldVisibilityInput {
  const fieldId = trimmedOptionalText(dependsOn?.field ?? null);
  if (fieldId === undefined) {
    return { kind: "always" };
  }

  const value = trimmedOptionalText(dependsOn?.value ?? null);
  if (value === undefined) {
    return { kind: "when-present", fieldId };
  }

  return { kind: "when-equal", fieldId, value };
}

export function pushFieldDefinitionIssues(
  error: z.ZodError,
  fieldId: string,
  issues: FieldCompileIssue[]
): void {
  for (const issue of error.issues) {
    issues.push({
      code: "field.definition-invalid",
      fieldId,
      path: issue.path.map((part) => (typeof part === "number" ? part : String(part))),
      message: issue.message,
    });
  }
}
