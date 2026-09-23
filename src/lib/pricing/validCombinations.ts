import type { Field, IProduct, ProductMaterialValue } from "../types.svelte";
import { isFieldVisible } from "../product/field";

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
 * - every required material slot must be filled, subject to
 *   `banned_combinations` — the same multiplicity-based rule the material
 *   picker enforces (a banned entry disables a candidate once every other
 *   member of the banned set is already chosen);
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
 * - toggle covers both states; embroidery/input never block and never price.
 *
 * `lengthSourceName` marks the field driving length-based pricing; it collapses
 * to one shape because the per-meter rule covers every reachable length.
 */
export function fieldCombinations(fields: Field[], lengthSourceName?: string): FieldCombo[] {
  const { order, cyclic } = dependencyOrder(fields);

  interface Branch {
    /** name → chosen field value; `fields` mirrors the product order, so
     *  `depends_on` visibility can be evaluated exactly as the form does. */
    values: Record<string, Field>;
    fields: Field[];
  }

  let branches: Branch[] = [
    { values: {}, fields: fields.map((f) => ({ ...f })) },
  ];

  for (const field of order) {
    const next: Branch[] = [];
    for (const branch of branches) {
      const visible =
        !cyclic.has(field.name) && isFieldVisible(field, branch.fields);
      if (!visible) {
        next.push(branch);
        continue;
      }
      let choices: Field[];
      if (field.name === lengthSourceName) {
        // The per-meter price is what matters; every length scales it.
        choices = [field];
      } else {
        switch (field.type) {
          case "radio":
          case "select":
          case "color": {
            choices = (field.items ?? [])
              .filter((item) => item != null)
              .map((item) => ({ ...field, value: { value: item.value } }));
            if (field.allow_custom_value) {
              choices.push({ ...field, value: { value: "__custom__" } });
            }
            break;
          }
          case "toggle": {
            choices = [
              { ...field, value: { value: false } },
              { ...field, value: { value: true } },
            ];
            break;
          }
          default: {
            // embroidery and input: never required, never price-relevant — one
            // shape, no value.
            choices = [field];
            break;
          }
        }
      }
      for (const choice of choices) {
        const updatedFields = branch.fields.map((f) =>
          f.name === field.name ? choice : f
        );
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

function matchesBanned(
  selectedIds: string[],
  combination: Array<{ material_path: { material_id: string } | null | undefined } | null | undefined>
): boolean {
  const wanted: string[] = [];
  for (const material of combination) {
    const id = material?.material_path?.material_id;
    if (id != null) {
      wanted.push(id);
    }
  }

  // The material picker ignores single-member banned entries.
  if (wanted.length <= 1) {
    return false;
  }

  // Multiset subset: the selection must contain at least as many of each
  // material as the banned entry lists.
  const counts = new Map<string, number>();
  for (const id of selectedIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const wantedCounts = new Map<string, number>();
  for (const id of wanted) {
    wantedCounts.set(id, (wantedCounts.get(id) ?? 0) + 1);
  }
  for (const [id, need] of wantedCounts) {
    if ((counts.get(id) ?? 0) < need) {
      return false;
    }
  }
  return true;
}

/**
 * All valid material-slot selections for a product: every slot filled, with no
 * banned combination completed (multiplicity-based, mirroring
 * `OrderItemMaterials.svelte`).
 */
export function materialCombinations(product: IProduct): Array<ProductMaterialValue[]> {
  const materials = product.materials.materials;
  const required = product.materials.material_required_count;
  if (required <= 0 || materials.length === 0) {
    return [[]];
  }

  const banned = (product.materials.banned_combinations ?? [])
    .filter((combination): combination is NonNullable<typeof combination> => combination != null)
    .map((combination) => combination.materials ?? []);

  const combos: Array<ProductMaterialValue[]> = [[]];
  for (let slot = 0; slot < required; slot++) {
    const next: Array<ProductMaterialValue[]> = [];
    for (const combo of combos) {
      const selectedIds = combo.map((value) => value.material_id);
      for (const material of materials) {
        if (!material) {
          continue;
        }
        const id = material.material_path.material_id;
        const trial = [...selectedIds, id];
        const isBanned = banned.some((combination) => matchesBanned(trial, combination));
        if (!isBanned) {
          next.push([...combo, { material_id: id, colors: [] }]);
        }
      }
    }
    combos.length = 0;
    combos.push(...next);
  }
  return combos;
}

/** Assemble a complete, form-reachable item from one field and material combo. */
export function combineProduct(
  product: IProduct,
  fieldCombo: FieldCombo,
  materialCombo: ProductMaterialValue[]
): IProduct {
  return {
    ...product,
    fields: product.fields.map((field) => {
      const choice = fieldCombo[field.name];
      return choice && choice !== field ? structuredClone(choice) : field;
    }),
    materials: {
      ...product.materials,
      values: [...materialCombo],
    },
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

  const zeroPrices: PricedCombination[] = [];
  for (const fieldCombo of fieldCombinations(product.fields, lengthSourceName)) {
    for (const materialCombo of materialCombinations(product)) {
      const item = combineProduct(product, fieldCombo, materialCombo);
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
  }
  return zeroPrices;
}

function priceUnit(item: IProduct): number {
  const parts: number[] = [Math.round(item.price)];
  for (const field of visibleFields(item.fields)) {
    parts.push(Math.round(fieldPrice(field, item) ?? 0));
  }
  const materials = item.materials;
  for (let i = 0; i < materials.material_required_count; i++) {
    const value = materials.values[i];
    const material = materials.materials.find(
      (m) => m?.material_path.material_id === value?.material_id
    );
    parts.push(Math.round(material?.price ?? 0));
  }
  return parts.reduce((sum, part) => sum + part, 0);
}

/** Per-part field price — the same branches as `calculatePriceForItem`. */
function fieldPrice(field: Field, product: IProduct): number | undefined {
  const sourceField = product.length_based_pricing?.sourceField;
  if (sourceField && field.name === sourceField) {
    // The length source carries no price; it scales the per-meter price.
    return undefined;
  }

  switch (field.type) {
    case "radio":
    case "color":
    case "select": {
      const selectedItem = (field.items ?? []).find((item) => !!item && item.value === field.value?.value);
      return selectedItem?.price ?? undefined;
    }
    case "toggle": {
      return field.value?.value === undefined
        ? undefined
        : field.value.value
          ? (field.price ?? undefined)
          : 0;
    }
    case "input": {
      return field.price ?? undefined;
    }
    default: {
      // Embroidery is opt-in: its absent shape contributes nothing. (Its
      // presence only adds price, so it can never be the *reason* a
      // combination is free.)
      return undefined;
    }
  }
}
