import type { IProduct, CmsProductMaterialOption, CmsProductMaterial } from "../types.svelte";
import { findFieldByName, resolveNumericValue } from "./field";

/** Find a material by id anywhere across the item's options. Label and colours
 * are slot-independent (the id resolves to the same material document), so a
 * flat lookup is correct for describing/summarising a selection. */
export function findMaterialById(
  item: Pick<IProduct, "materials">,
  materialId: string
): CmsProductMaterial | undefined {
  for (const option of item.materials.material_options) {
    for (const m of option.materials ?? []) {
      if (m?.material_path.material_id === materialId) {
        return m;
      }
    }
  }
  return undefined;
}

/** Whether `materialId` is one of the choices offered by `option` (its slot). */
export function isMaterialInOption(
  option: Pick<CmsProductMaterialOption, "materials">,
  materialId: string
): boolean {
  return (option.materials ?? []).some((m) => m?.material_path.material_id === materialId);
}

/** Display label for a material slot: the option's own label, falling back to a
 * generic "Anyag" / "Anyag {n}" when it is unlabelled. */
export function materialSlotLabel(
  option: Pick<CmsProductMaterialOption, "label">,
  index: number,
  total: number
): string {
  return option.label || (total > 1 ? `Anyag ${(index + 1).toString()}` : "Anyag");
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
export function areMaterialsComplete(item: Pick<IProduct, "fields" | "materials">): boolean {
  const { material_options, values } = item.materials;
  if (material_options.length === 0) {
    return true;
  }

  for (let i = 0; i < material_options.length; i++) {
    const option = material_options[i];
    const value = values[i];

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
