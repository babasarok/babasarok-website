import { type LocalizedText } from "@babasarok/product-definition";
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
export declare function nativeStateDiff(planned: NativeProductState, current: NativeProductState): NativeStateDiff[];
/**
 * Hash of the native state the sync owns (option groups with their options,
 * variant skus/names/prices, option assignments and facet values). The
 * product's own name and slug are the native Product's (ADR 0011 decision 1).
 * Canonicalized so presentation-order changes alone never read as drift.
 */
export declare function nativeStateHash(state: NativeProductState): string;
