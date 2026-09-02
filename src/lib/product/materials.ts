import type { IProduct, CmsProductMaterial } from "../types.svelte";
import { findFieldByName, resolveNumericValue } from "./fieldValue";

export function resolveColorCount(
  material: CmsProductMaterial | null,
  product: Pick<IProduct, "fields">
): number | undefined {
  if (material?.color_count == null) {
    return 1;
  }

  const val = Number.parseFloat(material.color_count);

  if (Number.isNaN(val)) {
    // Not a literal count → the string names a field that supplies the number.
    return resolveNumericValue(findFieldByName(product.fields, material.color_count));
  }

  return val;
}

/** Whether every required material slot has a material and its colours chosen
 * (a custom colour satisfies the colour requirement). Read-only mirror of the
 * material validation rules, so set siblings only get offered once the current
 * selection is complete. */
export function areMaterialsComplete(item: Pick<IProduct, "fields" | "materials">): boolean {
  const { materials, material_required_count, values } = item.materials;
  if (materials.length === 0 || material_required_count === 0) {
    return true;
  }

  if (values.length < material_required_count) {
    return false;
  }

  for (let i = 0; i < material_required_count; i++) {
    const value = values[i];

    if (!value || !value.material_id) {
      return false;
    }

    const info = materials.find((m) => m?.material_path.material_id === value.material_id);
    const count = resolveColorCount(info ?? null, item);
    if (!count || value.colors.length < count) {
      return false;
    }
  }
  return true;
}
