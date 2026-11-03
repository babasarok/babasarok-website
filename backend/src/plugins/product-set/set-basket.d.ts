import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { type PromotionWindow } from "./active-promotions";
import { type SetInstance } from "./set-allocation";
import { type LineSetState } from "./set-line-states";
export declare const PRODUCT_SET_CONDITION_CODE = "babasarok-product-set-basket";
/** The parts of a "Szettek" child collection the group parsing reads. */
export interface SetCollection {
    translations: ReadonlyArray<{
        languageCode: string;
        name: string;
        slug: string;
    }>;
    filters: ReadonlyArray<{
        code: string;
        args: ReadonlyArray<{
            name: string;
            value: string;
        }>;
    }>;
    customFields: {
        setDiscount: number | null;
    };
}
export interface BasketLine {
    id: unknown;
    quantity: number;
    listPrice: number;
    nativeProductId: number;
    selectionsRaw: unknown;
    options: ReadonlyArray<{
        groupCode: string;
        code: string;
    }>;
}
export interface DefinitionRow {
    nativeProductId: number | null;
    definition: CanonicalProductDefinition;
}
export interface SetGroup {
    groupId: string;
    label: string;
    discount: number;
    productIds: readonly string[];
}
export declare function memberIds(filters: SetCollection["filters"]): string[] | undefined;
/**
 * The discounted sets among the "Szettek" parent's children: members from the
 * native `product-id-filter`, label = the collection's name, discount = the
 * `setDiscount` custom field. Degenerate groups (<2 members, no/zero discount,
 * unusable filter) are ignored with a report, never thrown — a half-edited
 * collection must not break basket pricing.
 */
export declare function setGroups(children: readonly SetCollection[], productIdByNativeId: ReadonlyMap<number, string>): SetGroup[];
/** Native product ids whose definition rows are needed to evaluate the basket. */
export declare function relevantNativeProductIds(lines: readonly BasketLine[], children: readonly SetCollection[]): number[];
export interface SetBasketState {
    total: number;
    instances: SetInstance[];
    lineStates: Map<string, LineSetState>;
}
/**
 * The one allocation behind both the promotion and the shop API's set fields:
 * formed instances, their total and each line's set state. Empty when the
 * condition is not backed by exactly one active promotion (with several each
 * would deduct on its own, with none nothing is deducted).
 */
export declare function setBasketState(input: {
    promotions: readonly PromotionWindow[];
    channelId: unknown;
    now: Date;
    children: readonly SetCollection[];
    lines: readonly BasketLine[];
    definitionRows: readonly DefinitionRow[];
}): SetBasketState;
