import { canonicalJson } from "@babasarok/product-definition";
import { createHash } from "node:crypto";
/**
 * The (Hungarian) differences between the state a sync would produce and the
 * native product's current state, for the drift-detail display. Entries are
 * ordered product-level first, then option groups and variants by code/sku, so
 * the display is stable across calls.
 */
export function nativeStateDiff(planned, current) {
    const diffs = [];
    diffs.push(...optionGroupDiffs(planned.optionGroups, current.optionGroups), ...variantDiffs(planned.variants, current.variants));
    return diffs;
}
function sameText(a, b) {
    return canonicalJson(a) === canonicalJson(b);
}
function byCode(a, b) {
    return a[0].localeCompare(b[0]);
}
function optionGroupDiffs(planned, current) {
    const diffs = [];
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
function optionDiffs(groupCode, planned, current) {
    const diffs = [];
    const plannedByCode = new Map(planned.map((option) => [option.code, option]));
    const currentByCode = new Map(current.map((option) => [option.code, option]));
    for (const [code, option] of [...plannedByCode].toSorted(byCode)) {
        const existing = currentByCode.get(code);
        if (existing === undefined) {
            diffs.push({
                kind: "presence",
                label: `Opció "${groupCode}/${code}" (${option.name.hu}) létrehozásra vár`,
            });
        }
        else if (!sameText(option.name, existing.name)) {
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
function variantDiffs(planned, current) {
    const diffs = [];
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
function optionSignature(variant) {
    return variant.options
        .map((option) => `${option.groupCode}/${option.optionCode}`)
        .toSorted()
        .join(",");
}
function facetSignature(variant) {
    return [...variant.facetValues].toSorted((a, b) => a.localeCompare(b)).join(",");
}
function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
/**
 * Hash of the native state the sync owns (option groups with their options,
 * variant skus/names/prices, option assignments and facet values). The
 * product's own name and slug are the native Product's (ADR 0011 decision 1).
 * Canonicalized so presentation-order changes alone never read as drift.
 */
export function nativeStateHash(state) {
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
            options: [...variant.options].toSorted((a, b) => a.groupCode.localeCompare(b.groupCode) || a.optionCode.localeCompare(b.optionCode)),
            facetValues: [...variant.facetValues].toSorted((a, b) => a.localeCompare(b)),
        })),
    };
    return sha256(canonicalJson(canonical));
}
