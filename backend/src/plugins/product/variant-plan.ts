import type { ProductDefinition, ProductField } from "@babasarok/product-definition";
import { plannedVariantFacetCodes } from "./facet-plan";
import type { MaterialFacetData } from "./facet-plan";
import type { NativeProductState } from "./sync-state";
import { dependencyOrder, isVisible } from "./field-visibility";

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
  materialSlugs: string[];
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
 * `"<product name> (<values joined by ', ')>", except a value that appears in
 * more than one group of the same variant gets its group's label prefixed —
 * two material fields both offering wool read "Külső anyag: Gyapjú, Belső
 * anyag: Gyapjú" instead of an ambiguous "Gyapjú, Gyapjú".
 */
function variantName(
  productName: string,
  combo: readonly PlannedOption[],
  groups: readonly PlannedOptionGroup[]
): string {
  if (combo.length === 0) {
    return productName;
  }

  const occurrences = new Map<string, number>();

  for (const option of combo) {
    occurrences.set(option.name, (occurrences.get(option.name) ?? 0) + 1);
  }

  const values = groups.map((group, index) => {
    const option = combo[index];
    return (occurrences.get(option.name) ?? 0) > 1 ? `${group.name}: ${option.name}` : option.name;
  });

  return `${productName} (${values.join(", ")})`;
}

/**
 * The decision core of the native sync: which option groups/options the
 * structured model demands, which variant combinations exist after forbidden
 * combinations are omitted, and each variant's total price. Pure — the service
 * only applies this against Vendure's services. `productName` is the native
 * product's (hu) name, which the sync reads from the native product itself
 * (ADR 0011 decision 1: the native Product owns the name).
 *
 * Choice, toggle and material fields become option groups; input, embroidery
 * and color-presentation choice fields never do (ADR 0010: free text, per-word
 * pricing and color selections are carried on order lines, not variants).
 * Each variant's price counts only the option groups the order form could have
 * selected for that combination: a variant-axis field hidden by its
 * `visibility` given the variant's own picks contributes nothing, mirroring the
 * form and the 0-Ft walk — the group still rides the matrix, the price does
 * not. Length-priced products leave every variant at 0 Ft: their price depends
 * on the buyer-entered length and the per-material per-cm prices, which the
 * storefront quote path owns until the server-side pricing integration lands.
 */
export function planVariantCombinations(
  definition: ProductDefinition,
  materialDataBySlug: ReadonlyMap<string, MaterialFacetData>,
  productName: string
): VariantPlan {
  const optionGroups: PlannedOptionGroup[] = [];
  const groupFields: ProductField[] = [];
  const materialGroupIndexes: number[] = [];
  const { cyclic } = dependencyOrder(definition.fields);
  const knownFieldIds = new Set(definition.fields.map((field) => field.id));

  for (const field of definition.fields) {
    if (field.kind === "choice") {
      // ADR 0010 decision 5: colors are storefront selections, never variant axes.
      if (field.presentation === "color") {
        continue;
      }

      optionGroups.push({
        code: field.id,
        name: field.label,
        options: field.options.map((option) => ({
          code: option.id,
          name: option.label,
          price: option.price,
        })),
      });
      groupFields.push(field);
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
      groupFields.push(field);
      continue;
    }

    if (field.kind === "material") {
      materialGroupIndexes.push(optionGroups.length);
      optionGroups.push({
        code: field.id,
        name: field.label,
        options: field.options.map((option) => ({
          code: option.materialId,
          name: materialDataBySlug.get(option.materialId)?.label ?? option.materialId,
          price: option.price,
        })),
      });
      groupFields.push(field);
    }
  }

  const combinations = optionGroups.reduce<PlannedOption[][]>(
    (acc, group) => acc.flatMap((combo) => group.options.map((option) => [...combo, option])),
    [[]]
  );

  let bannedOmitted = 0;
  const variants: PlannedVariant[] = [];

  for (const combo of combinations) {
    const materialSlugs = materialGroupIndexes.map((index) => combo[index].code);

    if (isBanned(materialSlugs, definition.forbiddenMaterialCombinations)) {
      bannedOmitted += 1;
      continue;
    }

    const values = new Map<string, string | boolean>();

    for (const [index, field] of groupFields.entries()) {
      const code = combo[index].code;

      values.set(field.id, field.kind === "toggle" ? code === "igen" : code);
    }

    const optionCodes = combo.map((option) => option.code);

    variants.push({
      sku: optionCodes.length === 0 ? definition.id : `${definition.id}--${optionCodes.join("-")}`,
      name: variantName(productName, combo, optionGroups),
      price:
        definition.pricing.kind === "length"
          ? 0
          : definition.basePrice +
            combo.reduce(
              (sum, option, index) =>
                isVisible(groupFields[index], cyclic, knownFieldIds, values)
                  ? sum + option.price
                  : sum,
              0
            ),
      optionCodes,
      materialSlugs,
    });
  }

  return { optionGroups, variants, bannedOmitted };
}

/**
 * The native state a sync of `definition` against the current materials and
 * the native product's current name would produce. Pure — the staleness
 * indicator hashes this against the native product's actual state ("would a
 * sync change anything?"), which covers edited definitions,
 * renamed/deleted materials and native-side hand edits alike. The product's
 * own name and slug are not sync-owned (ADR 0011 decision 1), so they are not
 * part of the state.
 */
export function plannedNativeState(
  definition: ProductDefinition,
  materialDataBySlug: ReadonlyMap<string, MaterialFacetData>,
  productName: string
): NativeProductState {
  const plan = planVariantCombinations(definition, materialDataBySlug, productName);
  const facetCodesBySku = plannedVariantFacetCodes(plan, materialDataBySlug);

  return {
    optionGroups: plan.optionGroups.map((group) => ({
      code: group.code,
      name: group.name,
      options: group.options.map((option) => ({ code: option.code, name: option.name })),
    })),
    variants: plan.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      price: variant.price,
      options: variant.optionCodes.map((code, groupIndex) => ({
        groupCode: plan.optionGroups[groupIndex]?.code ?? "",
        optionCode: code,
      })),
      facetValues: facetCodesBySku.get(variant.sku) ?? [],
    })),
  };
}
