import type { Field, IProduct } from "../types.svelte";

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
 *   Toggles accept `true`/`1`; embroidery enables the field and sets its text;
 *   a `material` field sets its chosen material id.
 * - `<embroideryField>_color=<colorId>`
 *   — the thread colour for an embroidery field. Field names win over this
 *   pattern: a product field literally named `<name>_color` /
 * - `<materialField>_colors=<c1,c2,…>` — comma-separated colour ids for a
 *   `material` field.
 */
export function prefillFromParams(item: IProduct, params: URLSearchParams): void {
  const count = params.get("count");
  if (count != null) {
    const parsed = Number.parseInt(count, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      item.count = parsed;
    }
  }

  for (const [key, raw] of params.entries()) {
    if (key === "uuid" || key === "count") {
      continue;
    }

    const field = item.fields.find((f) => f.name === key);
    if (field) {
      applyFieldParam(field, raw);
      continue;
    }

    const embroideryColor = /^(?<name>.+?)_color$/.exec(key);
    if (embroideryColor?.groups) {
      const target = item.fields.find(
        (f) => f.type === "embroidery" && f.name === embroideryColor.groups?.name
      );
      if (target?.type === "embroidery") {
        target.value ??= { enabled: true, text: { value: "" }, color: { color: "" } };
        target.value.enabled = true;
        target.value.color.color = raw;
        continue;
      }
    }

    const materialColors = /^(?<name>.+?)_colors$/.exec(key);
    if (materialColors?.groups) {
      const target = item.fields.find(
        (f) => f.type === "material" && f.name === materialColors.groups?.name
      );
      if (target?.type === "material") {
        target.value ??= { material_id: "", colors: [] };
        target.value.colors = raw
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        continue;
      }
    }
  }
}

/**
 * Serialise an item's chosen materials into query params using the same scheme
 * {@link prefillFromParams} reads, so a set sibling's page can be deep-linked
 * with the current material selection preselected.
 */
export function buildMaterialParams(item: Pick<IProduct, "fields">): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of item.fields) {
    if (field.type !== "material") {
      continue;
    }
    const value = field.value;
    if (!value?.material_id) {
      continue;
    }
    params.set(field.name, value.material_id);
    if (value.colors.length > 0) {
      params.set(`${field.name}_colors`, value.colors.join(","));
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
    case "material": {
      field.value ??= { material_id: "", colors: [] };
      field.value.material_id = raw;
      return;
    }
    default: {
      const matchesOption = field.items?.some((item) => item?.value === raw);
      const isCustom = !matchesOption && !!field.allow_custom_value;
      field.value = isCustom ? { value: raw, is_custom: true } : { value: raw };
    }
  }
}
