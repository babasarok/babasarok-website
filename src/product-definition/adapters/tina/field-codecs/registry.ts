import { isProductFieldType } from "../../../../lib/product/fieldTypes";
import type { ProductFieldType } from "../../../../lib/product/fieldTypes";
import type { ProductField } from "../../../product";
import type { TinaProductFieldSource } from "../source-types";
import { compileChoiceField } from "./choice";
import { compileEmbroideryField } from "./embroidery";
import { compileInputField } from "./input";
import { compileMaterialField } from "./material";
import { compileToggleField } from "./toggle";
import type { FieldCompileIssue, FieldCompileResult, SourceFieldKindCodec } from "./shared";

const choiceFieldCodec =
  (presentation: "select" | "radio" | "color"): SourceFieldKindCodec =>
  (source, fieldId, issues): ProductField | undefined =>
    compileChoiceField(source, fieldId, issues, presentation);

export const SOURCE_FIELD_CODECS = {
  input: compileInputField,
  select: choiceFieldCodec("select"),
  radio: choiceFieldCodec("radio"),
  color: choiceFieldCodec("color"),
  material: compileMaterialField,
  toggle: compileToggleField,
  embroidery: compileEmbroideryField,
} satisfies Record<ProductFieldType, SourceFieldKindCodec>;

export const CANONICAL_FIELD_KINDS = {
  input: ["input"],
  choice: ["select", "radio", "color"],
  toggle: ["toggle"],
  material: ["material"],
  embroidery: ["embroidery"],
} satisfies Record<ProductField["kind"], readonly ProductFieldType[]>;

export function compileField(source: TinaProductFieldSource): FieldCompileResult {
  const fieldId = source.name.trim();
  const codec = isProductFieldType(source.type) ? SOURCE_FIELD_CODECS[source.type] : undefined;

  if (codec === undefined) {
    return {
      success: false,
      issues: [
        {
          code: "field.unknown-kind",
          fieldId,
          path: ["type"],
          message: `Ismeretlen mező típus: "${source.type}".`,
        },
      ],
    };
  }

  const issues: FieldCompileIssue[] = [];
  const field = codec(source, fieldId, issues);
  if (field === undefined || issues.length > 0) {
    return { success: false, issues };
  }

  return { success: true, value: field };
}
