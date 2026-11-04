import { type LocalizedText, type ProductDefinition } from "@babasarok/product-definition";
import type { MaterialFacetData } from "./facet-plan";
import type { NativeProductState } from "./sync-state";
export interface PlannedOption {
    code: string;
    name: LocalizedText;
    price: number;
}
export interface PlannedOptionGroup {
    code: string;
    name: LocalizedText;
    options: PlannedOption[];
}
export interface PlannedVariant {
    sku: string;
    name: LocalizedText;
    price: number;
    optionCodes: string[];
    materialSlugs: string[];
}
export interface VariantPlan {
    optionGroups: PlannedOptionGroup[];
    variants: PlannedVariant[];
    bannedOmitted: number;
}
/**
 * True when some variant is named after the product: every variant-axis field
 * is a toggle (or there is none), so the all-off variant has no parts to name.
 */
export declare function variantNamesUseProductName(definition: ProductDefinition): boolean;
/**
 * The decision core of the native sync: which option groups/options the
 * structured model demands, which variant combinations exist after forbidden
 * combinations are omitted, and each variant's total price. Pure — the service
 * only applies this against Vendure's services. `productName` is the native
 * product's per-language names, which the sync reads from the native product itself
 * (ADR 0011 decision 1: the native Product owns the name).
 *
 * Choice, toggle and material fields become option groups; input, embroidery
 * and color-presentation choice fields never do (ADR 0010: free text, per-word
 * pricing and color selections are carried on order lines, not variants).
 * Each variant's price counts only the option groups the order form could have
 * selected for that combination: a variant-axis field hidden by its
 * `visibility` given the variant's own picks contributes nothing, mirroring the
 * form and the 0-Ft walk — the group still rides the matrix, the price does
 * not. Length-priced products leave every variant at 0 Ft: their price depends
 * on the buyer-entered length and the per-material per-cm prices, which the
 * storefront quote path owns until the server-side pricing integration lands.
 */
export declare function planVariantCombinations(definition: ProductDefinition, materialDataBySlug: ReadonlyMap<string, MaterialFacetData>, productName: LocalizedText): VariantPlan;
/**
 * The native state a sync of `definition` against the current materials and
 * the native product's current name would produce. Pure — the staleness
 * indicator hashes this against the native product's actual state ("would a
 * sync change anything?"), which covers edited definitions,
 * renamed/deleted materials and native-side hand edits alike. The product's
 * own name and slug are not sync-owned (ADR 0011 decision 1), so they are not
 * part of the state.
 */
export declare function plannedNativeState(definition: ProductDefinition, materialDataBySlug: ReadonlyMap<string, MaterialFacetData>, productName: LocalizedText): NativeProductState;
