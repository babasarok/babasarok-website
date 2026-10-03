import type { Field, IProduct, MaterialField } from "../types.svelte";
import { findFieldByName, resolveNumericValue } from "./field";

/** Whether `materialId` is one of the choices offered by the material field. */
export function isMaterialInOption(option: MaterialField, materialId: string): boolean {
  return (option.materials ?? []).some((m) => m?.material_path.material_id === materialId);
}

export function resolveColorCount(
  option: { color_count: string | null | undefined } | null,
  product: Pick<IProduct, "fields">
): number | undefined {
  if (option?.color_count == null) {
    return 1;
  }

  const val = Number.parseFloat(option.color_count);

  if (Number.isNaN(val)) {
    // Not a literal count → the string names a field that supplies the number.
    return resolveNumericValue(findFieldByName(product.fields, option.color_count));
  }

  return val;
}

/** Whether every material slot has a material from its option and its colours
 * chosen (a custom colour satisfies the colour requirement). Read-only mirror of
 * the material validation rules, so set siblings only get offered once the
 * current selection is complete. */
export function areMaterialsComplete(item: Pick<IProduct, "fields">): boolean {
  const materials = item.fields.filter((f) => f.type === "material");
  if (materials.length === 0) {
    return true;
  }

  for (let i = 0; i < materials.length; i++) {
    const option = materials[i];
    const value = materials[i].value;

    if (!value || !value.material_id) {
      return false;
    }

    // The chosen material must belong to this slot's option.
    if (!isMaterialInOption(option, value.material_id)) {
      return false;
    }

    const count = resolveColorCount(option, item);
    if (!count || value.colors.length < count) {
      return false;
    }
  }
  return true;
}
