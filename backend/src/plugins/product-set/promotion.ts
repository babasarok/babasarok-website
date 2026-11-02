import {
  Collection,
  EntityHydrator,
  LanguageCode,
  Promotion,
  PromotionCondition,
  PromotionOrderAction,
  TransactionalConnection,
} from "@vendure/core";
import type { Injector, Order, RequestContext } from "@vendure/core";
import { IsNull, In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import {
  PRODUCT_SET_CONDITION_CODE,
  relevantNativeProductIds,
  setBasketState,
  type BasketLine,
} from "./set-basket";
import type { SetInstance } from "./set-allocation";
import { SET_PARENT_SLUG } from "./group-parents";

export { PRODUCT_SET_CONDITION_CODE };

/**
 * `extends Record<string, unknown>` satisfies Vendure's
 * `PromotionConditionState` constraint while keeping the named fields typed.
 */
export interface ProductSetConditionState extends Record<string, unknown> {
  total: number;
  instances: SetInstance[];
}

// The documented pattern for configurable operations: services captured at
// init time, used from the check/execute functions.
let connection: TransactionalConnection;
let entityHydrator: EntityHydrator;

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
    connection = injector.get(TransactionalConnection);
    entityHydrator = injector.get(EntityHydrator);
  },
  check: async (ctx: RequestContext, order: Order): Promise<ProductSetConditionState | false> => {
    const parent = await connection.getRepository(ctx, Collection).findOne({
      relations: { translations: true },
      where: { translations: { slug: SET_PARENT_SLUG } },
    });

    if (parent === null) {
      return false;
    }

    const children = await connection.getRepository(ctx, Collection).find({
      where: { parentId: parent.id },
      relations: { translations: true },
    });

    await entityHydrator.hydrate(ctx, order, {
      relations: [
        "lines",
        "lines.productVariant",
        "lines.productVariant.options",
        "lines.productVariant.options.group",
      ],
    });

    const lines: BasketLine[] = order.lines.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      listPrice: line.listPrice,
      nativeProductId: Number(line.productVariant.productId),
      selectionsRaw: line.customFields.selections,
      options: line.productVariant.options.map((option) => ({
        groupCode: option.group.code,
        code: option.code,
      })),
    }));
    const definitionRows = await connection.getRepository(ctx, ProductDefinition).find({
      select: { nativeProductId: true, definition: true },
      where: { nativeProductId: In(relevantNativeProductIds(lines, children)) },
    });
    const promotions = await connection.getRepository(ctx, Promotion).find({
      where: { enabled: true, deletedAt: IsNull() },
      relations: { channels: true },
    });

    return setBasketState({
      promotions,
      channelId: ctx.channelId,
      now: new Date(),
      children,
      lines,
      definitionRows,
    });
  },
});

/**
 * Removes the allocated set discounts from the order total: the sum of the
 * formed instances' clamped amounts, computed by the basket condition.
 */
export const productSetDiscountAction = new PromotionOrderAction({
  code: "babasarok-product-set-discount",
  description: [
    { languageCode: LanguageCode.hu, value: "A képződött szett-példányok összes kedvezménye." },
  ],
  args: {},
  conditions: [productSetBasketCondition],
  execute(_ctx, _order, _args, state) {
    return -state[PRODUCT_SET_CONDITION_CODE].total;
  },
});
