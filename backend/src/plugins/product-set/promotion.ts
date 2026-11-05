import { LanguageCode, PromotionCondition, PromotionItemAction } from "@vendure/core";
import type { Injector, Order, RequestContext } from "@vendure/core";
import { PRODUCT_SET_CONDITION_CODE } from "./set-basket";
import { SetBasketService } from "./set-basket.service";

export { PRODUCT_SET_CONDITION_CODE };

/**
 * `extends Record<string, unknown>` satisfies Vendure's
 * `PromotionConditionState` constraint while keeping the named fields typed.
 */
export interface ProductSetConditionState extends Record<string, unknown> {
  /** Line id → the discount that line's covered units earn, prorated by price. */
  lineDiscounts: Record<string, number>;
}

// The documented pattern for configurable operations: services captured at
// init time, used from the check/execute functions.
let setBasketService: SetBasketService;

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
  init(injector: Injector): void {
    setBasketService = injector.get(SetBasketService);
  },
  check: async (ctx: RequestContext, order: Order): Promise<ProductSetConditionState | false> => {
    const state = await setBasketService.stateForOrder(ctx, order);

    if (state === undefined || state.instances.length === 0) {
      return false;
    }

    return { lineDiscounts: state.lineDiscounts };
  },
});

/**
 * Charges each line its own share of the formed instances' clamped amounts
 * (prorated by price, computed by the basket condition), so the order's
 * line-level discounts land on the set members only and match the shop API's
 * exposed per-set view. Vendure multiplies the returned per-unit value by the
 * line's quantity and rounds, which reproduces the per-line total exactly.
 */
export const PRODUCT_SET_ACTION_CODE = "babasarok-product-set-discount";

export const productSetDiscountAction = new PromotionItemAction({
  code: PRODUCT_SET_ACTION_CODE,
  description: [
    { languageCode: LanguageCode.hu, value: "A képződött szett-példányok összes kedvezménye." },
  ],
  args: {},
  conditions: [productSetBasketCondition],
  execute(_ctx, orderLine, _args, state) {
    const discount = state[PRODUCT_SET_CONDITION_CODE].lineDiscounts[String(orderLine.id)] ?? 0;

    return -discount / orderLine.quantity;
  },
});
