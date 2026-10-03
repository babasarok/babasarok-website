import type { Field, IProduct } from "../types.svelte";
import { isFieldVisible } from "../product/field";
import { bannedCombinationIds, completesBannedCombination } from "../product/materials";
import { FIELD_BEHAVIORS, fieldIs } from "../product/behavior";

const isMaterialField = fieldIs("material");

/**
 * The "valid combination" check: a product may not be sellable at 0 Ft.
 *
 * A combination is any configuration a buyer can actually complete and submit
 * in the order form — the mirror of the form's own rules:
 *
 * - only *visible* fields count (`depends_on`), the same way
 *   `calculatePriceForItem` prices them and the form hides them;
 * - radio/select/color fields must be picked (the form marks them required, so
 *   no value is a legitimate configuration);
 * - `material` fields must have a material picked (each entry of the field's
 *   `materials` list is a choice), subject to `banned_combinations` — the same
 *   multiplicity-based rule the form's validation enforces (a choice is
 *   pruned once it would complete a banned combination); the colour
 *   selection is never enumerated — it never changes the price;
 * - embroidery is never forced (enabling it only adds price);
 * - `input` fields carry no price and are never blocking.
 *
 * A combination prices at 0 Ft when its unit price is 0, or (length-priced
 * products) when the per-meter price is 0, because any length then sells for
 * 0 Ft.
 */

/** A complete, form-reachable field configuration (absent = unchosen). */
export type FieldCombo = Partial<Record<string, Field>>;

/** A complete, form-reachable configuration: how it prices at 0 Ft and the item shape it produced. */
export interface PricedCombination {
  product: IProduct;
  /** Unit price, when the product is not length-priced. */
  unitPrice: number | undefined;
  /** Per-meter price (always 0 when set), for length-priced products. */
  perMeterPrice: number | undefined;
}

function visibleFields(fields: Field[]): Field[] {
  return fields.filter((field) => isFieldVisible(field, fields));
}

/**
 * Fields in dependency order (each `depends_on` target before its dependents),
 * plus the names caught in a dependency cycle. Cyclic fields are unreachable in
 * the form — none of them can be the first selection — so they are treated as
 * permanently hidden.
 */
function dependencyOrder(fields: Field[]): { order: Field[]; cyclic: Set<string> } {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const indegree = new Map(fields.map((f) => [f.name, 0]));
  const dependents = new Map<string, string[]>();
  for (const field of fields) {
    const dep = field.depends_on?.field;
    if (dep && dep !== field.name && byName.has(dep)) {
      indegree.set(field.name, (indegree.get(field.name) ?? 0) + 1);
      dependents.set(dep, [...(dependents.get(dep) ?? []), field.name]);
    }
  }

  const queue = fields.filter((f) => (indegree.get(f.name) ?? 0) === 0).map((f) => f.name);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    ordered.push(name);
    for (const dependent of dependents.get(name) ?? []) {
      indegree.set(dependent, (indegree.get(dependent) ?? 1) - 1);
      if ((indegree.get(dependent) ?? 0) === 0) {
        queue.push(dependent);
      }
    }
  }

  const orderedSet = new Set(ordered);
  const cyclic = new Set(fields.map((f) => f.name).filter((n) => !orderedSet.has(n)));
  const order: Field[] = [];
  for (const name of ordered) {
    const field = byName.get(name);
    if (field) {
      order.push(field);
    }
  }
  return { order, cyclic };
}

/**
 * All price-relevant field configurations a buyer can complete, as field-name
 * → value records. Each combination carries a `fields` array (every field, with
 * values only on the chosen ones) so `depends_on` visibility can be evaluated
 * exactly, the same way the form does.
 *
 * Rules mirrored from the form:
 * - a field is enumerable only if visible for the values the combination
 *   already holds (`depends_on`); fields are processed in dependency order so
 *   the target's value is known;
 * - radio/select/color require a selection (each item; plus a sentinel custom
 *   value when `allow_custom_value` — it passes the required check and prices
 *   at 0, since no item matches it);
 * - a `material` field requires a material (each entry is a choice); a choice
 *   is pruned when it would complete a banned combination given the other
 *   material fields' selections so far;
 * - toggle covers both states; embroidery/input never block and never price.
 *
 * `lengthSourceName` marks the field driving length-based pricing; it collapses
 * to one shape because the per-meter rule covers every reachable length.
 * `banned` lists the product's banned material combinations (id multisets).
 */
export function fieldCombinations(
  fields: Field[],
  banned: string[][],
  lengthSourceName?: string
): FieldCombo[] {
  const { order, cyclic } = dependencyOrder(fields);

  interface Branch {
    /** name → chosen field value; `fields` mirrors the product order, so
     *  `depends_on` visibility can be evaluated exactly as the form does. */
    values: Record<string, Field>;
    fields: Field[];
  }

  let branches: Branch[] = [{ values: {}, fields: fields.map((f) => ({ ...f })) }];

  for (const field of order) {
    const next: Branch[] = [];
    for (const branch of branches) {
      const visible = !cyclic.has(field.name) && isFieldVisible(field, branch.fields);
      if (!visible) {
        next.push(branch);
        continue;
      }
      let choices: Field[];
      if (field.name === lengthSourceName) {
        // The per-meter price is what matters; every length scales it.
        choices = [field];
      } else {
        choices = FIELD_BEHAVIORS[field.type].enumerate(field);
        if (field.type === "material") {
          // The gate's branch-dependent half of the banned-combination rule:
          // a choice is pruned when it would complete a banned combination
          // given the other material fields' selections on this branch.
          choices = choices.filter((choice) => {
            const id = isMaterialField(choice) ? choice.value?.material_id : undefined;
            return (
              id === undefined || !completesBannedCombination(branch.fields, field, id, banned)
            );
          });
        }
      }
      for (const choice of choices) {
        const updatedFields = branch.fields.map((f) => (f.name === field.name ? choice : f));
        next.push({
          values: { ...branch.values, [field.name]: choice },
          fields: updatedFields,
        });
      }
    }
    branches = next;
  }

  return branches.map((branch) => branch.values);
}

/** Assemble a complete, form-reachable item from one field combo. */
export function combineProduct(product: IProduct, fieldCombo: FieldCombo): IProduct {
  return {
    ...product,
    fields: product.fields.map((field) => {
      const choice = fieldCombo[field.name];
      return choice && choice !== field ? structuredClone(choice) : field;
    }),
  };
}

/**
 * Every form-reachable configuration of `product` that still prices at 0 Ft —
 * i.e. a way to sell it for free. Empty when the product can never be sold
 * for 0 Ft.
 *
 * Length-priced products are judged by their per-meter price: when it is 0,
 * every reachable length (listed or typed-in custom) sells for 0 Ft.
 */
export function findZeroPriceCombinations(product: IProduct): PricedCombination[] {
  const lengthSourceName = product.length_based_pricing?.sourceField;
  const banned = bannedCombinationIds(product);

  const zeroPrices: PricedCombination[] = [];
  for (const fieldCombo of fieldCombinations(product.fields, banned, lengthSourceName)) {
    const item = combineProduct(product, fieldCombo);
    const combo: PricedCombination = {
      product: item,
      unitPrice: undefined,
      perMeterPrice: undefined,
    };

    const unit = priceUnit(item);
    if (lengthSourceName) {
      // `unit` is the per-meter price; it prices every reachable length.
      if (unit === 0) {
        combo.perMeterPrice = 0;
        zeroPrices.push(combo);
      }
    } else {
      combo.unitPrice = unit;
      if (unit === 0) {
        zeroPrices.push(combo);
      }
    }
  }
  return zeroPrices;
}

function priceUnit(item: IProduct): number {
  const parts: number[] = [Math.round(item.price)];
  for (const field of visibleFields(item.fields)) {
    parts.push(Math.round(fieldPrice(field, item) ?? 0));
  }
  return parts.reduce((sum, part) => sum + part, 0);
}

/** Per-part field price — the same contribution as `calculatePriceForItem`. */
function fieldPrice(field: Field, product: IProduct): number | undefined {
  const sourceField = product.length_based_pricing?.sourceField;
  if (sourceField && field.name === sourceField) {
    // The length source carries no price; it scales the per-meter price.
    return undefined;
  }

  return FIELD_BEHAVIORS[field.type].price(field)?.price;
}
