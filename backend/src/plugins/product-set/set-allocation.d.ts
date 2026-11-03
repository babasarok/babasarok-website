/**
 * The set-discount allocation, ported from the site's `src/lib/pricing/
 * setDiscount.ts` (the backend keeps its own copy until the cutover, ADR 0010
 * decision 6). One formed instance is one unit each of two or more distinct
 * set members whose material selections are pairwise compatible; sets are
 * processed by descending flat amount, and each basket unit is consumed at
 * most once. Leftover units earn nothing. Groups come from the "Szettek"
 * collection's children (the product-set promotion). See
 * docs/specs/product-sets.md.
 */
export interface AllocationLine {
    /** The order line the units belong to. */
    lineId: string;
    /** The canonical product id the line sells. */
    productId: string;
    quantity: number;
    /** Gross unit price in whole forints, as the line is charged. */
    unitPrice: number;
    /** One entry per picked material field: the material and its chosen colors. */
    materials: ReadonlyArray<{
        materialId: string;
        colors: readonly string[];
    }>;
}
export interface AllocationGroup {
    groupId: string;
    label: string;
    /** The flat forint amount one formed instance removes (positive). */
    discount: number;
    productIds: readonly string[];
}
export interface SetInstance {
    groupId: string;
    label: string;
    /** The member lines, one covered unit each, in allocation order. */
    members: string[];
    /** The set's unclamped flat amount, for the order email's provenance. */
    nominal: number;
    /** The amount actually removed: clamped to the covered units' subtotal. */
    amount: number;
}
export declare function linesMaterialsMatch(a: AllocationLine, b: AllocationLine): boolean;
/**
 * The basket's formed set instances, in allocation order, each with its
 * clamped amount. Pure and deterministic.
 */
export declare function allocateSetDiscounts(lines: readonly AllocationLine[], groups: readonly AllocationGroup[]): SetInstance[];
