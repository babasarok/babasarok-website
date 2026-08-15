import type { Field, IProduct, ProductMaterialValue } from "./types.svelte";

/**
 * Prefill an order item from URL query parameters, so product pages can be
 * deep-linked with preselected options. Mutates `item` in place; the caller is
 * expected to {@link sanitizeItem} afterwards.
 *
 * Reserved keys (not treated as options): `uuid`, `count`.
 *
 * Scheme:
 * - `count=<n>` — item quantity (integer ≥ 1).
 * - `<fieldName>=<value>` — a product field, keyed by its frontmatter `name`.
 *   Toggles accept `true`/`1`; embroidery enables the field and sets its text.
 * - `<embroideryField>_color=<colorId>` / `<embroideryField>_custom_color=<hex>`
 *   — the thread colour for an embroidery field.
 * - `m<i>=<materialId>` — the material chosen for slot `i` (0-based).
 * - `m<i>_colors=<c1,c2,…>` — comma-separated colour ids for slot `i`.
 * - `m<i>_custom=<hex>` — a custom colour for slot `i`.
 */
export function prefillFromParams(item: IProduct, params: URLSearchParams): void {
  const count = params.get("count");
  if (count != null) {
    const parsed = Number.parseInt(count, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      item.count = parsed;
    }
  }

  const materialSlots = new Map<number, ProductMaterialValue>();
  const ensureSlot = (index: number): ProductMaterialValue | undefined => {
    if (index < 0 || index >= item.materials.material_required_count) {
      return undefined;
    }
    let slot = materialSlots.get(index);
    if (!slot) {
      slot = { material_id: "", colors: [] };
      materialSlots.set(index, slot);
    }
    return slot;
  };

  for (const [key, raw] of params.entries()) {
    if (key === "uuid" || key === "count") {
      continue;
    }

    const field = item.fields.find((f) => f.name === key);
    if (field) {
      applyFieldParam(field, raw);
      continue;
    }

    const embroideryColor = /^(?<name>.+?)_(?<kind>custom_color|color)$/.exec(key);
    if (embroideryColor?.groups) {
      const target = item.fields.find(
        (f) => f.type === "embroidery" && f.name === embroideryColor.groups?.name
      );
      if (target?.type === "embroidery") {
        target.value ??= { enabled: true, text: { value: "" }, color: { color: "" } };
        target.value.enabled = true;
        if (embroideryColor.groups.kind === "custom_color") {
          target.value.color.custom_color = raw;
        } else {
          target.value.color.color = raw;
        }
        continue;
      }
    }

    const material = /^m(?<index>\d+)(?:_(?<kind>colors|custom))?$/.exec(key);
    if (material?.groups) {
      const slot = ensureSlot(Number.parseInt(material.groups.index, 10));
      if (!slot) {
        continue;
      }
      if (material.groups.kind === "colors") {
        slot.colors = raw
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
      } else if (material.groups.kind === "custom") {
        slot.custom_color = raw;
      } else {
        slot.material_id = raw;
      }
    }
  }

  if (materialSlots.size > 0) {
    const values: Array<ProductMaterialValue | undefined> = [...item.materials.values];
    for (const [index, slot] of materialSlots) {
      values[index] = slot;
    }
    item.materials.values = values;
  }
}

/**
 * Serialise an item's chosen materials into query params using the same scheme
 * {@link prefillFromParams} reads, so a set sibling's page can be deep-linked
 * with the current material selection preselected.
 */
export function buildMaterialParams(item: Pick<IProduct, "materials">): URLSearchParams {
  const params = new URLSearchParams();
  const { values, material_required_count } = item.materials;
  for (let i = 0; i < material_required_count; i++) {
    const slot = values[i];
    if (!slot?.material_id) {
      continue;
    }
    params.set(`m${i}`, slot.material_id);
    if (slot.colors.length > 0) {
      params.set(`m${i}_colors`, slot.colors.join(","));
    }
    if (slot.custom_color) {
      params.set(`m${i}_custom`, slot.custom_color);
    }
  }
  return params;
}

function applyFieldParam(field: Field, raw: string): void {
  switch (field.type) {
    case "toggle": {
      field.value = { value: raw === "true" || raw === "1" };
      return;
    }
    case "embroidery": {
      field.value ??= { enabled: true, text: { value: "" }, color: { color: "" } };
      field.value.enabled = true;
      field.value.text = { value: raw };
      return;
    }
    default: {
      const matchesOption = field.items?.some((item) => item?.value === raw);
      const isCustom = !matchesOption && !!field.allow_custom_value;
      field.value = isCustom ? { value: raw, is_custom: true } : { value: raw };
    }
  }
}
