import type { IProduct, CmsProductMaterial } from "./types.svelte";
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
