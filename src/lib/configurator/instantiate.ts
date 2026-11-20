import { sanitizeItem } from "@/lib/configurator/validation";
import { randomUUID } from "@/lib/uuid";
import type { ConfiguratorProduct } from "@/lib/configurator/types";
import type { ConfiguratorItem } from "@/lib/configurator/item.svelte";

/** Whether a product carries its own configurable options (fields such as
 * size, toggles or embroidery), so it needs to be configured on its own page
 * rather than added with defaults. */
export function hasConfigurableOptions(product: Pick<ConfiguratorProduct, "fields">): boolean {
  return !!product.fields?.some((f) => f != null);
}

/** Build a fresh configurator item from a catalog product (same shape the product
 * picker produces). Input must be a plain object (e.g. `$state.snapshot(...)`). */
export function instantiateProduct(product: ConfiguratorProduct): ConfiguratorItem {
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
