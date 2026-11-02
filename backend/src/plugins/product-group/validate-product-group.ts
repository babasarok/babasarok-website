import {
  ProductGroupDefinitionSchema,
  type DiscountedProductSet,
  type ProductGroupDefinition,
  type RelatedItems,
} from "@babasarok/product-definition";

/** The admin-API shape of a group write (before validation). */
export interface ProductGroupInputData {
  label: string;
  kind: string;
  discount: number | null;
  productIds: string[];
}

export type ProductGroupValidationResult =
  { success: true; definition: ProductGroupDefinition } | { success: false; errors: string[] };

/**
 * Validates a group write against the canonical ProductGroupDefinitionSchema
 * plus repo policy zod cannot see: every member must exist as a product
 * definition. A discounted set requires a positive flat discount; zero or
 * absent makes the group related items (product-sets spec).
 */
export function validateProductGroupInput(
  groupId: string,
  input: ProductGroupInputData,
  existingProductIds: ReadonlySet<string>
): ProductGroupValidationResult {
  const candidate: Record<string, unknown> = {
    kind: input.kind,
    id: groupId,
    label: input.label,
    productIds: input.productIds,
  };

  if (input.kind === "discounted-set") {
    candidate.discount = input.discount;
  }

  const parsed = ProductGroupDefinitionSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const definition = parsed.data;
  const errors: string[] = [];

  for (const productId of definition.productIds) {
    if (!existingProductIds.has(productId)) {
      errors.push(`${productId}: Nincs termék ezzel az azonosítóval.`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, definition };
}

/** The group ids a promotion's conditions reference, by our condition code. */
export function promotionGroupIds(
  conditions: ReadonlyArray<{ code: string; args: ReadonlyArray<{ name: string; value: string }> }>
): string[] {
  const ids: string[] = [];

  for (const condition of conditions) {
    if (condition.code !== "babasarok-product-set-basket") {
      continue;
    }

    for (const argument of condition.args) {
      if (argument.name !== "groupIds") {
        continue;
      }

      try {
        const value: unknown = JSON.parse(argument.value);

        if (Array.isArray(value)) {
          ids.push(...value.filter((id): id is string => typeof id === "string"));
        }
      } catch {
        // An unparsable arg value cannot name the group.
      }
    }
  }

  return ids;
}

export function isDiscountedSet(
  definition: ProductGroupDefinition
): definition is DiscountedProductSet {
  return definition.kind === "discounted-set";
}

export function isRelatedItems(definition: ProductGroupDefinition): definition is RelatedItems {
  return definition.kind === "related-items";
}
