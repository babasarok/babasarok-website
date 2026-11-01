import type { ProductDefinition } from "@babasarok/product-definition";

export interface PlannedOption {
  code: string;
  name: string;
  price: number;
}

export interface PlannedOptionGroup {
  code: string;
  name: string;
  options: PlannedOption[];
}

export interface PlannedVariant {
  sku: string;
  name: string;
  price: number;
  optionCodes: string[];
}

export interface VariantPlan {
  optionGroups: PlannedOptionGroup[];
  variants: PlannedVariant[];
  bannedOmitted: number;
}

/** Whether `rule`'s material multiset is fully coverable by `chosen`'s. */
function ruleCoveredBy(rule: readonly string[], chosen: readonly string[]): boolean {
  const available = new Map<string, number>();

  for (const materialId of chosen) {
    available.set(materialId, (available.get(materialId) ?? 0) + 1);
  }

  for (const materialId of rule) {
    const left = available.get(materialId) ?? 0;

    if (left === 0) {
      return false;
    }

    available.set(materialId, left - 1);
  }

  return true;
}

function isBanned(
  chosenMaterialIds: readonly string[],
  forbidden: readonly (readonly string[])[]
): boolean {
  return forbidden.some((rule) => ruleCoveredBy(rule, chosenMaterialIds));
}

/**
 * The decision core of the native sync: which option groups/options the
 * structured model demands, which variant combinations exist after forbidden
 * combinations are omitted, and each variant's total price. Pure — the service
 * only applies this against Vendure's services.
 *
 * Choice, toggle and material fields become option groups; input and
 * embroidery fields never do (ADR 0010: free text and per-word pricing are
 * carried on order lines, not variants). Length-priced products leave every
 * variant at 0 Ft: their price depends on the buyer-entered length and the
 * per-material per-cm prices, which the storefront quote path owns until the
 * server-side pricing integration lands.
 */
export function planVariantCombinations(
  definition: ProductDefinition,
  materialLabelById: ReadonlyMap<string, string>
): VariantPlan {
  const optionGroups: PlannedOptionGroup[] = [];
  const materialGroupIndexes: number[] = [];

  for (const field of definition.fields) {
    if (field.kind === "choice") {
      optionGroups.push({
        code: field.id,
        name: field.label,
        options: field.options.map((option) => ({
          code: option.id,
          name: option.label,
          price: option.price,
        })),
      });
      continue;
    }

    if (field.kind === "toggle") {
      optionGroups.push({
        code: field.id,
        name: field.label,
        options: [
          { code: "nem", name: "Nem", price: 0 },
          { code: "igen", name: "Igen", price: field.price },
        ],
      });
      continue;
    }

    if (field.kind === "material") {
      materialGroupIndexes.push(optionGroups.length);
      optionGroups.push({
        code: field.id,
        name: field.label,
        options: field.options.map((option) => ({
          code: option.materialId,
          name: materialLabelById.get(option.materialId) ?? option.materialId,
          price: option.price,
        })),
      });
    }
  }

  const combinations = optionGroups.reduce<PlannedOption[][]>(
    (acc, group) => acc.flatMap((combo) => group.options.map((option) => [...combo, option])),
    [[]]
  );

  let bannedOmitted = 0;
  const variants: PlannedVariant[] = [];

  for (const combo of combinations) {
    const chosenMaterialIds = materialGroupIndexes.map((index) => combo[index].code);

    if (isBanned(chosenMaterialIds, definition.forbiddenMaterialCombinations)) {
      bannedOmitted += 1;
      continue;
    }

    const optionCodes = combo.map((option) => option.code);

    variants.push({
      sku: optionCodes.length === 0 ? definition.id : `${definition.id}--${optionCodes.join("-")}`,
      name:
        combo.length === 0
          ? definition.label
          : `${definition.label} (${combo.map((option) => option.name).join(", ")})`,
      price:
        definition.pricing.kind === "length"
          ? 0
          : definition.basePrice + combo.reduce((sum, option) => sum + option.price, 0),
      optionCodes,
    });
  }

  return { optionGroups, variants, bannedOmitted };
}
