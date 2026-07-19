import type { IProduct, CmsProductMaterial } from "./types.svelte";

function resolveValue(name: string, product: Pick<IProduct, "fields">): number | undefined {
  const field = product.fields.find((f) => f.name === name);
  const current =
    field?.type === "toggle" || field?.type === "embroidery" ? undefined : field?.value?.value;

  // FRAGILE: color-count-by-field-reference reinterprets another field's string
  // value as a number. There's no schema link between the referenced field and
  // this numeric use, so a non-numeric value silently resolves to `undefined`.
  // See docs/embroidery-field-plan.md “Field value typing” TODO.
  if (typeof current !== "string" || !current) {
    return undefined;
  }

  const val = Number.parseFloat(current);

  if (Number.isNaN(val)) {
    return undefined;
  }

  return val;
}

export function resolveColorCount(
  material: CmsProductMaterial | null,
  product: Pick<IProduct, "fields">
): number | undefined {
  if (material?.color_count == null) {
    return 1;
  }

  const val = Number.parseFloat(material.color_count);

  if (Number.isNaN(val)) {
    return resolveValue(material.color_count, product);
  }

  return val;
}
