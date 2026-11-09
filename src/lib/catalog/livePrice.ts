import type { ProductDefinition } from "@babasarok/product-definition";
import { valueConfiguredLine } from "@babasarok/pricing";
import { buildSelections } from "@/lib/basket/lineInput";
import type { Field, IProduct } from "@/lib/types.svelte";

const LANGUAGE = "hu";

function enteredString(field: Field | undefined): string | undefined {
  switch (field?.type) {
    case "input":
    case "select":
    case "radio":
    case "color":
      return field.value?.value;
    default:
      return undefined;
  }
}

/**
 * The unit price (Ft) the shared pricing package gives the configured item —
 * from the same selections the basket line carries — or null while it is
 * unpriceable (e.g. no length yet). Variant-axis fields the buyer has not
 * picked yet price at their first listed option.
 */
export function liveUnitPrice(
  definition: ProductDefinition,
  productName: string,
  item: Pick<IProduct, "fields">
): number | null {
  const { pricing } = definition;
  const lengthCm =
    pricing.kind === "length"
      ? Math.round(
          Number(enteredString(item.fields.find((field) => field.name === pricing.sourceFieldId)))
        )
      : null;

  const valuation = valueConfiguredLine({
    definition,
    productName,
    selections: buildSelections(item.fields),
    lengthCm: lengthCm === null || Number.isNaN(lengthCm) ? null : lengthCm,
    languageCode: LANGUAGE,
  });

  if (valuation.kind === "invalid") {
    return null;
  }

  return valuation.price;
}
