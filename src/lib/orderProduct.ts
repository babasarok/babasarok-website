import { sanitizeItem } from "./validation";
import { randomUUID } from "./uuid";
import type { CmsEnhancedProduct } from "./data";
import type { IProduct, ProductMaterialValue } from "./types.svelte";
import type { SavedProduct } from "./orderStorage";

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

/** Rebuild the order items from saved values against the current catalog,
 * dropping any product that no longer exists or whose structure differs. */
export function restoreProducts(
  saved: SavedProduct[],
  catalog: Record<string, CmsEnhancedProduct>
): IProduct[] {
  const restored: IProduct[] = [];
  for (const savedProduct of saved) {
    const catalogProduct = catalog[savedProduct.product_id] as CmsEnhancedProduct | undefined;
    if (!catalogProduct) {
      continue;
    }
    const product = restoreProduct(catalogProduct, savedProduct);
    if (product) {
      restored.push(product);
    }
  }
  return restored;
}
