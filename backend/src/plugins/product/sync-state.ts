import { canonicalJson, type LocalizedText } from "@babasarok/product-definition";
import { createHash } from "node:crypto";

export interface NativeOptionState {
  code: string;
  name: LocalizedText;
}

export interface NativeOptionGroupState {
  code: string;
  name: LocalizedText;
  options: NativeOptionState[];
}

/** One variant option pick, keyed by its group so group order cannot mask drift. */
export interface NativeVariantOptionState {
  groupCode: string;
  optionCode: string;
}

export interface NativeVariantState {
  sku: string;
  name: LocalizedText;
  price: number;
  options: NativeVariantOptionState[];
  facetValues: string[];
}

/** The sync-owned slice of the native Vendure product, hashed for drift detection.
 * The product's own name and slug are not sync-owned (ADR 0011 decision 1:
 * the native Product owns them) and therefore not part of the state. */
export interface NativeProductState {
  optionGroups: NativeOptionGroupState[];
  variants: NativeVariantState[];
}

/** One human-readable difference between the state a sync would produce and
 * the native product's current state. Separate from nativeStateHash so later
 * sync-owned slices can extend it without reshaping the hash. */
export interface NativeStateDiff {
  kind: "rename" | "presence" | "price" | "options" | "facets";
  label: string;
}

/**
 * The (Hungarian) differences between the state a sync would produce and the
 * native product's current state, for the drift-detail display. Entries are
 * ordered product-level first, then option groups and variants by code/sku, so
 * the display is stable across calls.
 */
export function nativeStateDiff(
  planned: NativeProductState,
  current: NativeProductState
): NativeStateDiff[] {
  const diffs: NativeStateDiff[] = [];

  diffs.push(
    ...optionGroupDiffs(planned.optionGroups, current.optionGroups),
    ...variantDiffs(planned.variants, current.variants)
  );

  return diffs;
}

function sameText(a: LocalizedText, b: LocalizedText): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function byCode(a: [string, unknown], b: [string, unknown]): number {
  return a[0].localeCompare(b[0]);
}

function optionGroupDiffs(
  planned: NativeOptionGroupState[],
  current: NativeOptionGroupState[]
): NativeStateDiff[] {
  const diffs: NativeStateDiff[] = [];
  const plannedByCode = new Map(planned.map((group) => [group.code, group]));
  const currentByCode = new Map(current.map((group) => [group.code, group]));

  for (const [code, group] of [...plannedByCode].toSorted(byCode)) {
    const existing = currentByCode.get(code);

    if (existing === undefined) {
      diffs.push({
        kind: "presence",
        label: `Opciócsoport "${code}" (${group.name.hu}) létrehozásra vár`,
      });
      continue;
    }

    if (!sameText(group.name, existing.name)) {
      diffs.push({
        kind: "rename",
        label: `Opciócsoport "${code}" átnevezve: "${existing.name.hu}" → "${group.name.hu}"`,
      });
    }

    diffs.push(...optionDiffs(code, group.options, existing.options));
  }

  for (const [code, group] of [...currentByCode].toSorted(byCode)) {
    if (!plannedByCode.has(code)) {
      diffs.push({
        kind: "presence",
        label: `Opciócsoport "${code}" (${group.name.hu}) törlésre vár`,
      });
    }
  }

  return diffs;
}

function optionDiffs(
  groupCode: string,
  planned: NativeOptionState[],
  current: NativeOptionState[]
): NativeStateDiff[] {
  const diffs: NativeStateDiff[] = [];
  const plannedByCode = new Map(planned.map((option) => [option.code, option]));
  const currentByCode = new Map(current.map((option) => [option.code, option]));

  for (const [code, option] of [...plannedByCode].toSorted(byCode)) {
    const existing = currentByCode.get(code);

    if (existing === undefined) {
      diffs.push({
        kind: "presence",
        label: `Opció "${groupCode}/${code}" (${option.name.hu}) létrehozásra vár`,
      });
    } else if (!sameText(option.name, existing.name)) {
      diffs.push({
        kind: "rename",
        label: `Opció "${groupCode}/${code}" átnevezve: "${existing.name.hu}" → "${option.name.hu}"`,
      });
    }
  }

  for (const [code, option] of [...currentByCode].toSorted(byCode)) {
    if (!plannedByCode.has(code)) {
      diffs.push({
        kind: "presence",
        label: `Opció "${groupCode}/${code}" (${option.name.hu}) törlésre vár`,
      });
    }
  }

  return diffs;
}

function variantDiffs(
  planned: NativeVariantState[],
  current: NativeVariantState[]
): NativeStateDiff[] {
  const diffs: NativeStateDiff[] = [];
  const plannedBySku = new Map(planned.map((variant) => [variant.sku, variant]));
  const currentBySku = new Map(current.map((variant) => [variant.sku, variant]));

  for (const [sku, variant] of [...plannedBySku].toSorted(byCode)) {
    const existing = currentBySku.get(sku);

    if (existing === undefined) {
      diffs.push({
        kind: "presence",
        label: `Változat "${sku}" (${variant.name.hu}) létrehozásra vár`,
      });
      continue;
    }

    if (!sameText(variant.name, existing.name)) {
      diffs.push({
        kind: "rename",
        label: `Változat "${sku}" átnevezve: "${existing.name.hu}" → "${variant.name.hu}"`,
      });
    }

    if (variant.price !== existing.price) {
      diffs.push({
        kind: "price",
        label: `Változat "${sku}" ára eltér: ${existing.price} → ${variant.price}`,
      });
    }

    if (optionSignature(variant) !== optionSignature(existing)) {
      diffs.push({ kind: "options", label: `Változat "${sku}" opciói eltérnek` });
    }

    if (facetSignature(variant) !== facetSignature(existing)) {
      diffs.push({ kind: "facets", label: `Változat "${sku}" facet értékei eltérnek` });
    }
  }

  for (const [sku, variant] of [...currentBySku].toSorted(byCode)) {
    if (!plannedBySku.has(sku)) {
      diffs.push({
        kind: "presence",
        label: `Változat "${sku}" (${variant.name.hu}) törlésre vár`,
      });
    }
  }

  return diffs;
}

function optionSignature(variant: NativeVariantState): string {
  return variant.options
    .map((option) => `${option.groupCode}/${option.optionCode}`)
    .toSorted()
    .join(",");
}

function facetSignature(variant: NativeVariantState): string {
  return [...variant.facetValues].toSorted((a, b) => a.localeCompare(b)).join(",");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Hash of the native state the sync owns (option groups with their options,
 * variant skus/names/prices, option assignments and facet values). The
 * product's own name and slug are the native Product's (ADR 0011 decision 1).
 * Canonicalized so presentation-order changes alone never read as drift.
 */
export function nativeStateHash(state: NativeProductState): string {
  const canonical = {
    optionGroups: [...state.optionGroups]
      .toSorted((a, b) => a.code.localeCompare(b.code))
      .map((group) => ({
        code: group.code,
        name: group.name,
        options: [...group.options].toSorted((a, b) => a.code.localeCompare(b.code)),
      })),
    variants: [...state.variants]
      .toSorted((a, b) => a.sku.localeCompare(b.sku))
      .map((variant) => ({
        sku: variant.sku,
        name: variant.name,
        price: variant.price,
        options: [...variant.options].toSorted(
          (a, b) =>
            a.groupCode.localeCompare(b.groupCode) || a.optionCode.localeCompare(b.optionCode)
        ),
        facetValues: [...variant.facetValues].toSorted((a, b) => a.localeCompare(b)),
      })),
  };

  return sha256(canonicalJson(canonical));
}
