import type { Injector } from "@vendure/core";
import { lineDiscounts, type SetInstance } from "./set-allocation";
import { LanguageCode, PromotionCondition, PromotionItemAction } from "@vendure/core";
import { SetBasketService } from "./set-basket.service";
import { PRODUCT_SET_CONDITION_CODE } from "./set-basket";

/**
 * The set-members condition: its args list the member products (stock product
 * multi-select), and the check runs the shared allocation for the owning
 * promotion only — the promotion's Hungarian name labels the set, and the
 * member gating is built in (order-level conditions cannot express the
 * per-line pending states). See docs/specs/product-sets.md and ADR 0014.
 */
export interface ProductSetConditionState {
  /** This promotion's formed instances, one entry per instance. */
  instances: Array<{ members: readonly string[] }>;
  /** Unit prices per covered line — the action clamps its arg against these. */
  unitPrices: Readonly<Record<string, number>>;
}

let setBasketService: SetBasketService;

export const productSetMembersCondition = new PromotionCondition({
  code: PRODUCT_SET_CONDITION_CODE,
  description: [
    {
      languageCode: LanguageCode.hu,
      value:
        "A kosár tartalmaz a szett tagjaiból összeálló, anyagában is egyező példányt (legalább 2 különböző tag).",
    },
  ],
  args: {
    productIds: {
      type: "ID",
      list: true,
      ui: { component: "product-multi-form-input" },
      label: [{ languageCode: LanguageCode.hu, value: "Szett tagjai" }],
    },
  },
  init(injector: Injector): void {
    setBasketService = injector.get(SetBasketService);
  },
  check: async (ctx, order, args, promotion) => {
    // At least 2 distinct members are needed; anything less can never form
    // an instance, and the shop API reports the group as degenerate anyway.
    if (new Set(args.productIds).size < 2) {
      return false;
    }

    // One shared computation for every active set promotion: the service
    // refuses to apply when two of them overlap on a product.
    const state = await setBasketService.stateForOrder(ctx, order);

    if (state === undefined) {
      return false;
    }

    const instances = state.instances.filter(
      (instance) => instance.groupId === String(promotion.id)
    );

    if (instances.length === 0) {
      return false;
    }

    return { instances, unitPrices: state.unitPrices };
  },
});

/**
 * Charges each line its own share of the formed instances' clamped amounts
 * (prorated by price, computed by the members condition), so the order's
 * line-level discounts land on the set members only and match the shop API's
 * exposed per-set view. Vendure multiplies the returned per-unit value by the
 * line's quantity and rounds, which reproduces the per-line total exactly.
 */
export const PRODUCT_SET_ACTION_CODE = "babasarok-product-set-discount";

export const productSetDiscountAction = new PromotionItemAction({
  code: PRODUCT_SET_ACTION_CODE,
  description: [
    { languageCode: LanguageCode.hu, value: "Szettpéldányonkénti kedvezmény kiosztása." },
  ],
  args: {
    amount: {
      type: "int",
      ui: { component: "currency-form-input" },
      label: [{ languageCode: LanguageCode.hu, value: "Kedvezmény (Ft)" }],
    },
  },
  conditions: [productSetMembersCondition],
  execute(_ctx, orderLine, args, state) {
    const amount = args.amount;
    const own = state[PRODUCT_SET_CONDITION_CODE] as ProductSetConditionState | undefined;

    if (own === undefined || amount <= 0) {
      return 0;
    }

    const priced: SetInstance[] = own.instances.map(({ members }) => {
      const subtotal = members.reduce((sum, lineId) => sum + (own.unitPrices[lineId] ?? 0), 0);

      return {
        groupId: "",
        label: "",
        members: [...members],
        nominal: amount,
        amount: Math.min(amount, subtotal),
      };
    });
    const shares = lineDiscounts(priced, new Map(Object.entries(own.unitPrices)));

    return -(shares.get(String(orderLine.id)) ?? 0) / orderLine.quantity;
  },
});
