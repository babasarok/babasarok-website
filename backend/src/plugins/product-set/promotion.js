import { LanguageCode, PromotionCondition, PromotionOrderAction } from "@vendure/core";
import { PRODUCT_SET_CONDITION_CODE } from "./set-basket";
import { SetBasketService } from "./set-basket.service";
export { PRODUCT_SET_CONDITION_CODE };
// The documented pattern for configurable operations: services captured at
// init time, used from the check/execute functions.
let setBasketService;
/**
 * Computes the basket's formed set instances (product-sets spec) from the
 * discounted-set collections under the "Szettek" parent. The returned state
 * carries the allocation into the promotion action; `false` when no instance
 * forms, so the promotion stays silent on unrelated baskets.
 */
export const productSetBasketCondition = new PromotionCondition({
    code: PRODUCT_SET_CONDITION_CODE,
    description: [
        {
            languageCode: LanguageCode.hu,
            value: "A kosár tartalmaz kompatibilis szett-tagokat, akikre a kedvezmény leosztódik.",
        },
    ],
    args: {},
    init(injector) {
        setBasketService = injector.get(SetBasketService);
    },
    check: async (ctx, order) => {
        const state = await setBasketService.stateForOrder(ctx, order);
        if (state === undefined || state.instances.length === 0) {
            return false;
        }
        return { total: state.total, instances: state.instances };
    },
});
/**
 * Removes the allocated set discounts from the order total: the sum of the
 * formed instances' clamped amounts, computed by the basket condition.
 */
export const PRODUCT_SET_ACTION_CODE = "babasarok-product-set-discount";
export const productSetDiscountAction = new PromotionOrderAction({
    code: PRODUCT_SET_ACTION_CODE,
    description: [
        { languageCode: LanguageCode.hu, value: "A képződött szett-példányok összes kedvezménye." },
    ],
    args: {},
    conditions: [productSetBasketCondition],
    execute(_ctx, _order, _args, state) {
        return -state[PRODUCT_SET_CONDITION_CODE].total;
    },
});
