import {
  ProductDefinitionSchema,
  type ProductDefinition,
  type ProductField,
} from "@babasarok/product-definition";

export type ProductDefinitionValidationResult =
  { success: true; definition: ProductDefinition } | { success: false; errors: string[] };

/** Field kinds whose buyer-facing value is a plain string (a numeric source candidate). */
const STRING_VALUED_FIELD_KINDS: ReadonlySet<ProductField["kind"]> = new Set(["input", "choice"]);

function stringValuedFieldIds(fields: readonly ProductField[]): Set<string> {
  return new Set(
    fields.filter((field) => STRING_VALUED_FIELD_KINDS.has(field.kind)).map((field) => field.id)
  );
}

function numericSourceErrors(
  where: string,
  sourceFieldId: string,
  fields: readonly ProductField[],
  fieldIds: ReadonlySet<string>,
  stringValuedIds: ReadonlySet<string>
): string[] {
  if (!fieldIds.has(sourceFieldId)) {
    return [`${where} nem létező mezőre hivatkozik: "${sourceFieldId}".`];
  }

  if (!stringValuedIds.has(sourceFieldId)) {
    return [`${where} ("${sourceFieldId}") olyan mezőre hivatkozik, ami nem adhat számértéket.`];
  }

  return [];
}

/**
 * Validates a definition handed to the admin API against the canonical
 * ProductDefinitionSchema and repo policy that zod alone cannot see: unique
 * field ids, numeric-capable pricing/color-count sources, and forbidden
 * combinations whose members exist in Vendure and are actually offered by
 * this product's material fields.
 */
export function validateProductDefinition(
  input: unknown,
  existingMaterialSlugs: ReadonlySet<string>
): ProductDefinitionValidationResult {
  const parsed = ProductDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const definition = parsed.data;
  const errors: string[] = [];
  const fieldIds = new Set<string>();

  for (const field of definition.fields) {
    if (fieldIds.has(field.id)) {
      errors.push(`${field.id}: Ez a mezőazonosító már létezik.`);
    }

    fieldIds.add(field.id);
  }

  const stringValuedIds = stringValuedFieldIds(definition.fields);

  if (definition.pricing.kind === "length") {
    errors.push(
      ...numericSourceErrors(
        'A méteráru "sourceField"',
        definition.pricing.sourceFieldId,
        definition.fields,
        fieldIds,
        stringValuedIds
      )
    );
  }

  for (const field of definition.fields) {
    if (field.kind !== "material" || field.colorCount.kind !== "from-field") {
      continue;
    }

    errors.push(
      ...numericSourceErrors(
        `A "${field.label}" anyagmező színszám-forrása`,
        field.colorCount.fieldId,
        definition.fields,
        fieldIds,
        stringValuedIds
      )
    );
  }

  const offeredMaterials = new Set(
    definition.fields
      .filter((field) => field.kind === "material")
      .flatMap((field) => field.options.map((option) => option.materialId))
  );

  for (const combination of definition.forbiddenMaterialCombinations) {
    for (const materialId of combination) {
      if (!offeredMaterials.has(materialId)) {
        errors.push(
          `${materialId}: A tiltott kombináció olyan anyagra hivatkozik, ami egyik anyagmezőben sem szerepel.`
        );
      } else if (!existingMaterialSlugs.has(materialId)) {
        errors.push(`${materialId}: Nincs anyag ezzel az azonosítóval.`);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, definition };
}
