import type { LocalizedText } from "@babasarok/product-definition";
import type { VariantPlan } from "./variant-plan";
/** The sync-owned facets: namespaced codes so admin-created facets can never collide. */
export declare const MATERIAL_FACET_CODE = "babasarok-material";
export declare const COLOR_FACET_CODE = "babasarok-color";
/** The owner-maintained facets (ADR 0011 decisions 2 and 3): never written by a sync. */
export declare const PRODUCT_TYPE_FACET_CODE = "babasarok-product-type";
export declare const THREAD_COLOR_FACET_CODE = "babasarok-thread-color";
/** The auto-managed per-material collections are found by this slug prefix (Collection has no code). */
export declare const MATERIAL_COLLECTION_SLUG_PREFIX = "material-";
export interface MaterialFacetData {
    label: LocalizedText;
    colors: ReadonlyArray<{
        id: string;
        label: LocalizedText;
    }>;
}
export interface PlannedFacetValue {
    facetCode: string;
    code: string;
    name: LocalizedText;
}
export declare function colorFacetValueCode(materialSlug: string, colorId: string): string;
/** The facet values a material demands: its material value plus one per color. */
export declare function materialFacetValues(material: {
    slug: string;
    label: LocalizedText;
    colors: MaterialFacetData["colors"];
}): PlannedFacetValue[];
/** Existing color facet values of the material whose color the material no longer has. */
export declare function staleColorFacetValueCodes(materialSlug: string, colorIds: ReadonlyArray<string>, existingCodes: ReadonlyArray<string>): string[];
/** The facet value codes each planned variant carries: its materials and those materials' colors. */
export declare function plannedVariantFacetCodes(plan: VariantPlan, materialDataBySlug: ReadonlyMap<string, MaterialFacetData>): Map<string, string[]>;
