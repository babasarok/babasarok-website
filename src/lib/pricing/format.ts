/**
 * Pure display formatters for the pricing core (ADR 0002): shared by the basket
 * summary (CheckoutItem) and the order email (`order/submit.ts`) so the two can
 * never drift apart.
 */
import type { CmsProductMaterial, ProductMaterialValue } from "../types.svelte";

/**
 * The "Name (colour, …)" label of a chosen material, with each chosen colour id
 * resolved to its label via the field's chosen material. The colours part is
 * trimmed and omitted entirely when there are no colours, so a colour-less pick
 * renders as just the material name (never `Név ()`).
 */
export function formatMaterialValue(
  material: CmsProductMaterial | undefined,
  value: ProductMaterialValue
): string {
  const name = material?.material_path.label ?? value.material_id;
  const colors = value.colors
    .map((id) => material?.material_path.colors?.find((c) => c.color_id === id)?.label ?? id)
    .join(", ");
  return colors ? `${name} (${colors.trim()})` : name;
}
