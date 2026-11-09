import type { EntityHydrator, ProductVariant, RequestContext } from "@vendure/core";
import { resolveText, type ProductDefinition } from "../../shared/product-definition/index";
import { isAxisField, type LineSelections } from "../../shared/pricing/index";

/** Option-group code → option code of the variant's generated options. */
export async function variantOptionCodes(
  entityHydrator: EntityHydrator,
  ctx: RequestContext,
  productVariant: ProductVariant
): Promise<Map<string, string>> {
  await entityHydrator.hydrate(ctx, productVariant, {
    relations: ["options", "options.group"],
  });

  return new Map(productVariant.options.map((option) => [option.group.code, option.code]));
}

/**
 * Why the line's variant does not match its selections, or undefined when it
 * does: a material or listed choice the selections pick must be the variant's
 * option, and the variant must carry an option for every variant-axis field.
 * Only the agreement is checked here; the price comes from the selections.
 */
export function variantDisagreement(
  definition: ProductDefinition,
  selections: LineSelections,
  variantCodes: ReadonlyMap<string, string>,
  languageCode: string
): string | undefined {
  for (const [fieldId, selection] of Object.entries(selections)) {
    const field = definition.fields.find((candidate) => candidate.id === fieldId);

    if (field === undefined || selection === undefined) {
      continue;
    }

    if (selection.kind === "material") {
      const optionCode = variantCodes.get(fieldId);

      if (optionCode === undefined) {
        return `A(z) "${fieldId}" anyagválasztása nincs rajta a kiválasztott változaton.`;
      }

      if (selection.materialId !== optionCode) {
        return `A(z) "${fieldId}" anyagválasztása nem egyezik a kiválasztott változattal.`;
      }
    }

    if (
      field.kind === "choice" &&
      field.presentation !== "color" &&
      selection.kind === "option" &&
      selection.value !== variantCodes.get(fieldId)
    ) {
      return `A(z) "${resolveText(field.label, languageCode)}" mező választása nem egyezik a kiválasztott változattal.`;
    }
  }

  const sourceFieldId =
    definition.pricing.kind === "length" ? definition.pricing.sourceFieldId : undefined;

  for (const field of definition.fields) {
    if (!isAxisField(field) || field.id === sourceFieldId || variantCodes.has(field.id)) {
      continue;
    }

    return `A(z) "${field.id}" választása nincs rajta a kiválasztott változaton.`;
  }

  return undefined;
}
