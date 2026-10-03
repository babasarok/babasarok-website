import { sanitizeItem } from "../product/validation";
import { isMaterialInOption } from "../product/materials";
import { randomUUID } from "../uuid";
import type { CmsEnhancedProduct } from "../data";
import type { Field, IProduct, ProductMaterialValue } from "../types.svelte";
import type { SavedProduct } from "./storage";

/** The persisted shape of a `material` field's value. */
type SavedMaterialField = Extract<SavedProduct["fields"][number], { type: "material" }>;

/** Whether a product carries its own configurable options (fields such as
 * size, toggles or embroidery) that don't transfer from a set partner, so it
 * needs to be configured on its own page rather than added with defaults. */
export function hasConfigurableOptions(product: Pick<CmsEnhancedProduct, "fields">): boolean {
  return !!product.fields?.some((f) => f != null);
}

/** Build a fresh order item from a catalog product (same shape the product
 * picker produces). Input must be a plain object (e.g. `$state.snapshot(...)`). */
export function instantiateProduct(product: CmsEnhancedProduct): IProduct {
  const clone = structuredClone(product);
  return sanitizeItem({
    ...clone,
    uuid: randomUUID(),
    count: 1,
    fields: clone.fields?.filter((f) => f != null) ?? [],
    materials: {
      banned_combinations: clone.materials?.banned_combinations?.filter((c) => c != null) ?? [],
    },
  });
}

/** The value of `target`'s same-named material field on `source`, kept only
 * when the material is still offered by `target`'s field (and actually
 * chosen). Undefined for non-material fields or when nothing carries over. */
function carriedMaterialValue(
  target: Field,
  sourceFields: Field[]
): ProductMaterialValue | undefined {
  if (target.type !== "material") {
    return undefined;
  }
  const sourceField = sourceFields.find((f) => f.name === target.name);
  if (sourceField?.type !== "material") {
    return undefined;
  }
  const value = sourceField.value;
  if (value == null || value.material_id === "") {
    return undefined;
  }
  return isMaterialInOption(target, value.material_id) ? structuredClone(value) : undefined;
}

/** Re-apply saved user values onto a fresh item from the current catalog.
 * Returns `null` when the persisted structure no longer matches the catalog
 * (fields added/removed/retyped, or an unknown material) so stale state is
 * discarded rather than restored inconsistently. */
function restoreProduct(catalog: CmsEnhancedProduct, saved: SavedProduct): IProduct | null {
  const base = instantiateProduct(catalog);

  const baseFieldKeys = base.fields.map((f) => `${f.name}:${f.type}`).toSorted();
  const savedFieldKeys = saved.fields.map((f) => `${f.name}:${f.type}`).toSorted();
  if (
    baseFieldKeys.length !== savedFieldKeys.length ||
    baseFieldKeys.some((key, i) => key !== savedFieldKeys[i])
  ) {
    return null;
  }

  // A saved material selection must still be offered by the catalog field
  // that holds it (stale state is discarded, not restored half-baked).
  for (const field of base.fields) {
    if (field.type !== "material") {
      continue;
    }
    const savedField = saved.fields.find(
      (f): f is SavedMaterialField => f.name === field.name && f.type === "material"
    );
    if (!savedField) {
      continue;
    }
    const value = savedField.value;
    if (value?.material_id && !isMaterialInOption(field, value.material_id)) {
      return null;
    }
  }

  base.count = saved.count;
  base.uuid = saved.uuid;
  for (const field of base.fields) {
    const savedField = saved.fields.find((f) => f.name === field.name);
    if (savedField?.value !== undefined) {
      // Types align: the name+type structural check above guarantees a match.
      Object.assign(field, { value: savedField.value });
    }
  }

  return sanitizeItem(base);
}

/** Rebuild the order items from saved values against the current catalog.
 * All-or-nothing: if any product no longer exists or its structure differs from
 * the catalog, the whole basket is discarded (returns `[]`). A partially
 * restored basket would silently drop items and confuse the user. */
export function restoreProducts(
  saved: SavedProduct[],
  catalog: Record<string, CmsEnhancedProduct>
): IProduct[] {
  const restored: IProduct[] = [];
  for (const savedProduct of saved) {
    const catalogProduct = catalog[savedProduct.product_id] as CmsEnhancedProduct | undefined;
    if (!catalogProduct) {
      return [];
    }
    const product = restoreProduct(catalogProduct, savedProduct);
    if (!product) {
      return [];
    }
    restored.push(product);
  }
  return restored;
}

/** Build a fresh order item for `target`, carrying over the choices the user
 * already made on `source` where they structurally match: field values with
 * the same name+type — for material fields, only when the target field still
 * offers that material. Both inputs must be plain objects (e.g.
 * `$state.snapshot(...)`). */
export function instantiateRelatedProduct(target: CmsEnhancedProduct, source: IProduct): IProduct {
  const base = instantiateProduct(target);

  for (const field of base.fields) {
    if (field.type === "material") {
      const value = carriedMaterialValue(field, source.fields);
      if (value !== undefined) {
        field.value = value;
      }
      continue;
    }
    const sourceField = source.fields.find((f) => f.name === field.name && f.type === field.type);
    if (sourceField?.value !== undefined) {
      // name+type match guarantees the value shapes align.
      Object.assign(field, { value: structuredClone(sourceField.value) });
    }
  }

  return sanitizeItem(base);
}

/** Copy `partner`'s material selections onto `item` so the two match and their
 * shared set discount activates. Only the item's own material fields are
 * touched, and only with materials the item offers. Both inputs must be plain
 * objects (e.g. `$state.snapshot(...)`). */
export function syncMaterialsToPartner(item: IProduct, partner: IProduct): IProduct {
  for (const field of item.fields) {
    const value = carriedMaterialValue(field, partner.fields);
    if (value !== undefined) {
      field.value = value;
    }
  }

  return sanitizeItem(item);
}
