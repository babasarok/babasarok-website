import type { CmsProductMaterial, Field, IProduct, MaterialField } from "../types.svelte";
import { findFieldByName, resolveNumericValue } from "./field";

/** The option in `field`'s `materials` list whose material is `materialId`. */
export function findMaterialOption(
  field: Pick<MaterialField, "materials">,
  materialId: string | undefined
): CmsProductMaterial | undefined {
  return (
    (field.materials ?? []).find((m) => m?.material_path.material_id === materialId) ?? undefined
  );
}

/** Whether `materialId` is one of the choices offered by the material field. */
export function isMaterialInOption(option: MaterialField, materialId: string): boolean {
  return findMaterialOption(option, materialId) !== undefined;
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

/** Whether every material field has a material from its list and its colours
 * chosen. Read-only mirror of the material validation rules, so set siblings
 * only get offered once the current selection is complete. */
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

    // The chosen material must belong to this field's list.
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

// #region Banned combinations
//
// A banned combination is a multiset of material ids (e.g. [X, X] — "material X
// must not be chosen twice"); single-member entries are ignored. The selection
// is the multiset of material ids currently chosen across the item's
// `material` fields. The two call sites (form validation and the build-time
// zero-price gate) share the matching so they can never drift apart.

function countMaterialIds(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Whether `selectedCounts` holds at least as many of each id as `required` lists. */
function isMultisubset(selectedCounts: Map<string, number>, required: string[]): boolean {
  for (const [id, need] of countMaterialIds(required)) {
    if ((selectedCounts.get(id) ?? 0) < need) {
      return false;
    }
  }
  return true;
}

/** The item's banned combinations resolved to plain material-id multisets. */
export function bannedCombinationIds(item: Pick<IProduct, "materials">): string[][] {
  return (item.materials.banned_combinations ?? [])
    .filter((combination): combination is NonNullable<typeof combination> => combination != null)
    .map((combination) =>
      (combination.materials ?? [])
        .map((material) => material?.material_path?.material_id)
        .filter((id): id is string => !!id)
    )
    .filter((ids) => ids.length > 1);
}

/**
 * Whether assigning `candidateId` to `field` (replacing its current selection)
 * would complete a banned combination given the other material fields' current
 * selections.
 */
export function completesBannedCombination(
  fields: Field[],
  field: Pick<Field, "name">,
  candidateId: string,
  banned: string[][]
): boolean {
  const counts = new Map<string, number>();
  for (const f of fields) {
    if (f.type !== "material" || f.name === field.name) {
      continue;
    }
    const id = f.value?.material_id;
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
  return banned.some((combination) => isMultisubset(counts, combination));
}

/**
 * The names of the material fields whose current selection completes a banned
 * combination — the form-level half of the banned-combination rule (the
 * zero-price gate's half is {@link completesBannedCombination}).
 */
export function bannedMaterialFieldNames(fields: Field[], banned: string[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const field of fields) {
    if (field.type !== "material") {
      continue;
    }
    const id = field.value?.material_id;
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const names = new Set<string>();
  for (const field of fields) {
    if (field.type !== "material") {
      continue;
    }
    const id = field.value?.material_id;
    if (!id) {
      continue;
    }
    if (
      banned.some((combination) => combination.includes(id) && isMultisubset(counts, combination))
    ) {
      names.add(field.name);
    }
  }
  return names;
}
// #endregion
