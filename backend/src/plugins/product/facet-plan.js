/** The sync-owned facets: namespaced codes so admin-created facets can never collide. */
export const MATERIAL_FACET_CODE = "babasarok-material";
export const COLOR_FACET_CODE = "babasarok-color";
/** The owner-maintained facets (ADR 0011 decisions 2 and 3): never written by a sync. */
export const PRODUCT_TYPE_FACET_CODE = "babasarok-product-type";
export const THREAD_COLOR_FACET_CODE = "babasarok-thread-color";
/** The auto-managed per-material collections are found by this slug prefix (Collection has no code). */
export const MATERIAL_COLLECTION_SLUG_PREFIX = "material-";
export function colorFacetValueCode(materialSlug, colorId) {
    return `${materialSlug}--${colorId}`;
}
/** The facet values a material demands: its material value plus one per color. */
export function materialFacetValues(material) {
    return [
        { facetCode: MATERIAL_FACET_CODE, code: material.slug, name: material.label },
        ...material.colors.map((color) => ({
            facetCode: COLOR_FACET_CODE,
            code: colorFacetValueCode(material.slug, color.id),
            name: color.label,
        })),
    ];
}
/** Existing color facet values of the material whose color the material no longer has. */
export function staleColorFacetValueCodes(materialSlug, colorIds, existingCodes) {
    const kept = new Set(colorIds.map((colorId) => colorFacetValueCode(materialSlug, colorId)));
    const stale = [];
    for (const code of existingCodes) {
        const boundary = code.indexOf("--");
        // The material part is everything before the first "--", so a material
        // slug containing "--" cannot swallow another material's values.
        if (boundary === -1 || code.slice(0, boundary) !== materialSlug) {
            continue;
        }
        if (!kept.has(code)) {
            stale.push(code);
        }
    }
    return stale;
}
/** The facet value codes each planned variant carries: its materials and those materials' colors. */
export function plannedVariantFacetCodes(plan, materialDataBySlug) {
    const codesBySku = new Map();
    for (const variant of plan.variants) {
        const codes = [];
        for (const slug of variant.materialSlugs) {
            if (!codes.includes(slug)) {
                codes.push(slug);
            }
            const material = materialDataBySlug.get(slug);
            if (material === undefined) {
                continue;
            }
            for (const color of material.colors) {
                const code = colorFacetValueCode(slug, color.id);
                if (!codes.includes(code)) {
                    codes.push(code);
                }
            }
        }
        codesBySku.set(variant.sku, codes);
    }
    return codesBySku;
}
