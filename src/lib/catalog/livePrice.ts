import type { ProductDefinition } from "@babasarok/product-definition";
import {
  dependencyOrder,
  isVisible,
  valueConfiguredLine,
  type LineSelections,
} from "@babasarok/pricing";
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
 * The unit price (Ft) the shared pricing package gives the configured item, or
 * null while it is unpriceable (e.g. no length yet). Variant-axis fields the
 * buyer has not picked yet price at their first listed option.
 */
export function liveUnitPrice(
  definition: ProductDefinition,
  productName: string,
  item: Pick<IProduct, "fields">
): number | null {
  const entered = new Map(item.fields.map((field) => [field.name, field]));
  const optionCodes = new Map<string, string>();
  const axisValues = new Map<string, string | boolean>();
  const axisPrices = new Map<string, number>();
  const selections: LineSelections = {};

  for (const field of definition.fields) {
    const enteredField = entered.get(field.id);

    if (field.kind === "material") {
      const value = enteredField?.type === "material" ? enteredField.value : undefined;
      const picked = field.options.find((option) => option.materialId === value?.material_id);
      const option = picked ?? field.options[0];

      optionCodes.set(field.id, option.materialId);
      axisValues.set(field.id, option.materialId);
      axisPrices.set(field.id, option.price);

      if (picked !== undefined && value !== undefined) {
        selections[field.id] = {
          kind: "material",
          materialId: picked.materialId,
          colors: value.colors,
        };
      }

      continue;
    }

    if (field.kind === "toggle") {
      const on = enteredField?.type === "toggle" && enteredField.value?.value === true;

      optionCodes.set(field.id, on ? "igen" : "nem");
      axisValues.set(field.id, on);
      axisPrices.set(field.id, on ? field.price : 0);
      continue;
    }

    if (field.kind === "choice") {
      const value = enteredString(enteredField);
      const picked = field.options.find((option) => option.id === value);

      if (field.presentation === "color") {
        if (picked !== undefined) {
          selections[field.id] = { kind: "option", value: picked.id };
        }

        continue;
      }

      const option = picked ?? field.options[0];

      optionCodes.set(field.id, option.id);
      axisValues.set(field.id, option.id);
      axisPrices.set(field.id, option.price);
      continue;
    }

    if (field.kind === "input") {
      const value = enteredString(enteredField);

      if (value !== undefined && value !== "") {
        selections[field.id] = { kind: "input", value };
      }

      continue;
    }

    if (enteredField?.type === "embroidery" && enteredField.value?.enabled) {
      selections[field.id] = {
        kind: "embroidery",
        text: enteredField.value.text.value,
        colorId: enteredField.value.color.color,
      };
    }
  }

  const { cyclic } = dependencyOrder(definition.fields);
  const knownFieldIds = new Set(definition.fields.map((field) => field.id));
  const variantListPrice = definition.fields.reduce(
    (sum, field) =>
      isVisible(field, cyclic, knownFieldIds, axisValues)
        ? sum + (axisPrices.get(field.id) ?? 0)
        : sum,
    definition.basePrice
  );

  const { pricing } = definition;
  const lengthCm =
    pricing.kind === "length"
      ? Math.round(Number(enteredString(entered.get(pricing.sourceFieldId))))
      : null;

  const valuation = valueConfiguredLine({
    definition,
    productName,
    variantListPrice: pricing.kind === "length" ? 0 : variantListPrice,
    optionCodes,
    selections,
    lengthCm: lengthCm === null || Number.isNaN(lengthCm) ? null : lengthCm,
    languageCode: LANGUAGE,
  });

  if (valuation.kind === "invalid") {
    return null;
  }

  return valuation.price;
}
