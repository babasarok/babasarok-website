import type { EntityHydrator, ProductVariant, RequestContext } from "@vendure/core";
import { resolveText, type ProductDefinition } from "../../shared/product-definition/index";
import { axisCodes, type LineSelections } from "../../shared/pricing/index";

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
 * Why the line's variant is not the one its selections imply (defaults
 * included, see `axisCodes`), or undefined when it is. Every variant-axis
 * field but a length source field must carry the derived option. Only the
 * agreement is checked here; the price comes from the selections.
 */
export function variantDisagreement(
  definition: ProductDefinition,
  selections: LineSelections,
  variantCodes: ReadonlyMap<string, string>,
  languageCode: string
): string | undefined {
  const derived = axisCodes(definition, selections, languageCode);

  if (!derived.ok) {
    return derived.message;
  }

  const sourceFieldId =
    definition.pricing.kind === "length" ? definition.pricing.sourceFieldId : undefined;

  for (const [fieldId, code] of derived.codes) {
    if (fieldId === sourceFieldId || variantCodes.get(fieldId) === code) {
      continue;
    }

    const field = definition.fields.find((candidate) => candidate.id === fieldId);
    const label = field === undefined ? fieldId : resolveText(field.label, languageCode);

    return `A(z) "${label}" mező választása nem egyezik a kiválasztott változattal.`;
  }

  return undefined;
}
