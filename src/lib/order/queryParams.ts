import type { LineSelections } from "@babasarok/pricing";
import type { IProduct } from "../types.svelte";
import { FIELD_BEHAVIORS } from "../product/behavior";

/**
 * Prefill an order item from URL query parameters, so product pages can be
 * deep-linked with preselected options. Mutates `item` in place; the caller is
 * expected to {@link sanitizeItem} afterwards.
 *
 * Reserved keys (not treated as options): `line`, `syncFrom`, `count`.
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
 *   `material` field. Each id is percent-encoded by the builder, so ids that
 *   themselves contain a comma survive the split.
 *
 * Prefilled values are validated like normal selections: an unknown field
 * name, material id, or colour outside the chosen material's palette is
 * ignored, so the configurator starts unselected for that part.
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
    if (key === "line" || key === "syncFrom" || key === "count") {
      continue;
    }

    const field = item.fields.find((f) => f.name === key);
    if (field) {
      // The type's own option/availability rules live in its behaviour; the
      // `_color` / `_colors` companions below are a product-level scheme.
      FIELD_BEHAVIORS[field.type].fillFromParams(field, raw);
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
          .map(decodeColorParam)
          .filter(Boolean);
        continue;
      }
    }
  }

  discardUnofferedMaterialColors(item);
}

/**
 * Undo the per-id `encodeURIComponent` that {@link buildMaterialParams} applies
 * before joining with commas — a comma inside a colour id survives as `%2C`.
 * Ids that fail to decode (legacy URLs with a raw `%`) keep their raw value.
 */
function decodeColorParam(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * Validate the material selections a prefill produced: colours picked without
 * a resolvable material are meaningless (the picker resets colours whenever a
 * material is chosen), and colours are limited to the chosen material's own
 * palette. Runs after the param loop so `<name>` and `<name>_colors` may
 * arrive in any order.
 */
function discardUnofferedMaterialColors(item: IProduct): void {
  for (const field of item.fields) {
    if (field.type !== "material") {
      continue;
    }
    const value = field.value;
    if (!value) {
      continue;
    }
    const material = (field.materials ?? []).find(
      (m) => m?.material_path.material_id === value.material_id
    );
    if (!material) {
      // Unknown (or no) material id: ignore the prefill entirely — per spec
      // the configurator starts unselected for that part.
      field.value = undefined;
      continue;
    }
    // Without a listed palette there is nothing to validate against (the
    // colour picker is hidden when a material offers no colours).
    const palette = material.material_path.colors;
    if (!palette?.length) {
      continue;
    }
    const offered = new Set(palette.map((color) => color.color_id));
    value.colors = value.colors.filter((color) => offered.has(color));
  }
}

function setMaterialParam(
  params: URLSearchParams,
  name: string,
  materialId: string,
  colors: readonly string[]
): void {
  params.set(name, materialId);

  if (colors.length === 0) {
    return;
  }

  // Percent-encode each id before joining with commas, so a comma inside
  // an id (real data: "Felhon alvo, feher") cannot read as a separator.
  params.set(`${name}_colors`, colors.map((c) => encodeURIComponent(c)).join(","));
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
    setMaterialParam(params, field.name, value.material_id, value.colors);
  }
  return params;
}

/** {@link buildMaterialParams} for a basket line's stored selections. */
export function selectionMaterialParams(selections: LineSelections): URLSearchParams {
  const params = new URLSearchParams();

  for (const [name, selection] of Object.entries(selections)) {
    if (selection?.kind !== "material" || selection.materialId === "") {
      continue;
    }

    setMaterialParam(params, name, selection.materialId, selection.colors);
  }

  return params;
}

/** A product page path, with the query appended when it carries any params. */
export function productPath(slug: string, params = new URLSearchParams()): string {
  const query = params.toString();

  if (query === "") {
    return `/product/${slug}/`;
  }

  return `/product/${slug}/?${query}`;
}
