import { PromotionCondition, PromotionOrderAction } from "@vendure/core";
import { PRODUCT_SET_CONDITION_CODE } from "./set-basket";
import type { SetInstance } from "./set-allocation";
export { PRODUCT_SET_CONDITION_CODE };
/**
 * `extends Record<string, unknown>` satisfies Vendure's
 * `PromotionConditionState` constraint while keeping the named fields typed.
 */
export interface ProductSetConditionState extends Record<string, unknown> {
    total: number;
    instances: SetInstance[];
}
/**
 * Computes the basket's formed set instances (product-sets spec) from the
 * discounted-set collections under the "Szettek" parent. The returned state
 * carries the allocation into the promotion action; `false` when no instance
 * forms, so the promotion stays silent on unrelated baskets.
 */
export declare const productSetBasketCondition: PromotionCondition<{}, "babasarok-product-set-basket", false | ProductSetConditionState>;
/**
 * Removes the allocated set discounts from the order total: the sum of the
 * formed instances' clamped amounts, computed by the basket condition.
 */
export declare const PRODUCT_SET_ACTION_CODE = "babasarok-product-set-discount";
export declare const productSetDiscountAction: PromotionOrderAction<{}, PromotionCondition<{}, "babasarok-product-set-basket", false | ProductSetConditionState>[]>;
