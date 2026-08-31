import { sanitizeItem } from "./validation";
import { randomUUID } from "./uuid";
import type { CmsEnhancedProduct } from "./data";
import type { IProduct, ProductMaterialValue } from "./types.svelte";
import type { SavedProduct } from "./orderStorage";

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
      ...clone.materials,
      materials: clone.materials?.materials?.filter((m) => m != null) ?? [],
      banned_combinations: clone.materials?.banned_combinations?.filter((c) => c != null) ?? [],
      material_required_count: clone.materials?.material_required_count ?? 1,
      values: [] as Array<ProductMaterialValue | undefined>,
    },
  });
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

  const availableMaterials = new Set(
    base.materials.materials.map((m) => m?.material_path.material_id).filter((id) => id != null)
  );
  if (saved.materials.some((m) => !availableMaterials.has(m.material_id))) {
    return null;
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
  base.materials.values = saved.materials.map((m) => ({ ...m }));

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
 * already made on `source` where they structurally match: field values with the
 * same name+type, and material selections whose material still exists on the
 * target (capped at the target's required count). Both inputs must be plain
 * objects (e.g. `$state.snapshot(...)`). */
export function instantiateRelatedProduct(target: CmsEnhancedProduct, source: IProduct): IProduct {
  const base = instantiateProduct(target);

  for (const field of base.fields) {
    const sourceField = source.fields.find((f) => f.name === field.name && f.type === field.type);
    if (sourceField?.value !== undefined) {
      // name+type match guarantees the value shapes align.
      Object.assign(field, { value: structuredClone(sourceField.value) });
    }
  }

  const availableMaterials = new Set(
    base.materials.materials.map((m) => m?.material_path.material_id).filter((id) => id != null)
  );
  base.materials.values = source.materials.values
    .filter((v): v is ProductMaterialValue => v != null && availableMaterials.has(v.material_id))
    .slice(0, base.materials.material_required_count)
    .map((v) => structuredClone(v));

  return sanitizeItem(base);
}

/** Copy `partner`'s material selections onto `item` so the two match and their
 * shared set discount activates. Keeps only materials the item supports, capped
 * at its required count. Both inputs must be plain objects (e.g.
 * `$state.snapshot(...)`). */
export function syncMaterialsToPartner(item: IProduct, partner: IProduct): IProduct {
  const availableMaterials = new Set(
    item.materials.materials.map((m) => m?.material_path.material_id).filter((id) => id != null)
  );
  const values = partner.materials.values
    .filter((v): v is ProductMaterialValue => v != null && availableMaterials.has(v.material_id))
    .slice(0, item.materials.material_required_count)
    .map((v) => structuredClone(v));

  return sanitizeItem({ ...item, materials: { ...item.materials, values } });
}
