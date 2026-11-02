import {
  EntityHydrator,
  LanguageCode,
  PromotionCondition,
  PromotionOrderAction,
  TransactionalConnection,
} from "@vendure/core";
import type { Injector, Order, RequestContext } from "@vendure/core";
import { In } from "typeorm";
import { parseLineSelections } from "../pricing/line-selection";
import { ProductDefinition } from "../product/product.entity";
import { ProductGroup } from "./product-group.entity";
import { allocateSetDiscounts, type AllocationLine, type SetInstance } from "./set-allocation";

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
 * discounted-set groups the promotion references. The returned state carries
 * the allocation into the promotion action; `false` when no instance forms,
 * so the promotion stays silent on unrelated baskets.
 */
export const productSetBasketCondition = new PromotionCondition({
  code: "babasarok-product-set-basket",
  description: [
    {
      languageCode: LanguageCode.hu,
      value: "A kosár tartalmaz kompatibilis szett-tagokat, akikre a kedvezmény leosztódik.",
    },
  ],
  args: {
    groupIds: {
      type: "ID",
      list: true,
      label: [{ languageCode: LanguageCode.hu, value: "Szett-csoportok" }],
    },
  },
  init(injector: Injector): void {
    connection = injector.get(TransactionalConnection);
    entityHydrator = injector.get(EntityHydrator);
  },
  check: async (
    ctx: RequestContext,
    order: Order,
    args
  ): Promise<ProductSetConditionState | false> => {
    await entityHydrator.hydrate(ctx, order, {
      relations: [
        "lines",
        "lines.productVariant",
        "lines.productVariant.options",
        "lines.productVariant.options.group",
      ],
    });

    const definitionRows = await connection
      .getRepository(ctx, ProductDefinition)
      .find({ select: { nativeProductId: true, definition: true } });
    const productIdByNativeId = new Map(
      definitionRows
        .filter((row) => row.nativeProductId !== null)
        .map((row) => [row.nativeProductId, row.definition.id])
    );

    const lines: AllocationLine[] = [];

    for (const line of order.lines) {
      const productId = productIdByNativeId.get(Number(line.productVariant.productId));

      if (productId === undefined) {
        // Placeholder lines (quote submissions) carry no configuration.
        continue;
      }

      let selections;

      try {
        selections = parseLineSelections(line.customFields.selections);
      } catch {
        // An unparsable blob cannot name materials; the line just earns nothing.
        continue;
      }

      const materials = Object.values(selections)
        .filter((selection) => selection?.kind === "material")
        .map((selection) => ({ materialId: selection.materialId, colors: [...selection.colors] }));

      lines.push({
        lineId: String(line.id),
        productId,
        quantity: line.quantity,
        unitPrice: line.listPrice,
        materials,
      });
    }

    const groupRows =
      args.groupIds.length === 0
        ? []
        : await connection.getRepository(ctx, ProductGroup).find({
            where: { groupId: In(args.groupIds) },
          });
    const groups = groupRows
      .filter((group) => group.kind === "discounted-set" && (group.discount ?? 0) > 0)
      .map((group) => ({
        groupId: group.groupId,
        label: group.label,
        discount: group.discount ?? 0,
        productIds: group.productIds,
      }));

    const instances = allocateSetDiscounts(lines, groups);

    if (instances.length === 0) {
      return false;
    }

    return { total: instances.reduce((sum, instance) => sum + instance.amount, 0), instances };
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
    return -state["babasarok-product-set-basket"].total;
  },
});
