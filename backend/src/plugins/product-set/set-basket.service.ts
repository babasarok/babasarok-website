import { Injectable } from "@nestjs/common";
import { OrderLine, Promotion, TransactionalConnection } from "@vendure/core";
import type { Order, RequestContext } from "@vendure/core";
import { In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import {
  activePromotions,
  amountFromArgs,
  huName,
  memberIdsFromArgs,
  PRODUCT_SET_ACTION_CODE,
  PRODUCT_SET_CONDITION_CODE,
  relevantNativeProductIds,
  setBasketState,
  type BasketLine,
  type PromotionSource,
  type SetBasketState,
} from "./set-basket";

const CONDITION_CODE = PRODUCT_SET_CONDITION_CODE;

/**
 * The active promotions parsed into set sources: label from the Hungarian
 * name, members from the condition args, the flat amount from the action arg.
 * Standalone so the shop-API resolver can use it with its own connection.
 */
export async function activeSetSources(
  ctx: RequestContext,
  connection: TransactionalConnection
): Promise<PromotionSource[]> {
  const rows = await connection.getRepository(ctx, Promotion).find({
    relations: { channels: true, translations: true },
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return activePromotions(rows, ctx.channelId, new Date()).flatMap((window_) => {
    const row = rowById.get(window_.id);
    const conditionArgs = row?.conditions.find(
      (condition) => condition.code === CONDITION_CODE
    )?.args;
    const actionArgs = row?.actions.find((action) => action.code === PRODUCT_SET_ACTION_CODE)?.args;
    const label = row === undefined ? undefined : huName(row.translations);

    if (row === undefined || conditionArgs === undefined || actionArgs === undefined) {
      return [];
    }

    const memberIds = memberIdsFromArgs(conditionArgs);
    const amount = amountFromArgs(actionArgs);

    if (memberIds === undefined || amount === null || label === undefined) {
      return [];
    }

    return [{ id: String(row.id), label, memberIds, amount }];
  });
}

@Injectable()
export class SetBasketService {
  constructor(private connection: TransactionalConnection) {}

  /**
   * The allocation for an order, read by the promotions and the shop API
   * alike. The order's own lines are never hydrated: that would overwrite the
   * calculator's not-yet-saved line prices with the stored ones. In-flight
   * quantities and prices are overlaid on the stored lines instead.
   */
  async stateForOrder(ctx: RequestContext, order: Order): Promise<SetBasketState | undefined> {
    const sources = await this.activeSources(ctx);

    if (sources.length === 0) {
      return undefined;
    }

    const stored = await this.connection.getRepository(ctx, OrderLine).find({
      where: { order: { id: order.id } },
      relations: { productVariant: { options: { group: true } } },
      order: { id: "ASC" },
    });
    const inFlight = new Map(
      (Array.isArray(order.lines) ? order.lines : []).map((line) => [String(line.id), line])
    );
    const lines: BasketLine[] = stored.map((line) => {
      const current = inFlight.get(String(line.id)) ?? line;

      return {
        id: line.id,
        quantity: current.quantity,
        listPrice: current.listPrice,
        nativeProductId: Number(line.productVariant.productId),
        selectionsRaw: line.customFields.selections,
        options: line.productVariant.options.map((option) => ({
          groupCode: option.group.code,
          code: option.code,
        })),
      };
    });
    const definitionRows = await this.connection.getRepository(ctx, ProductDefinition).find({
      select: { nativeProductId: true, definition: true },
      where: { nativeProductId: In(relevantNativeProductIds(lines, sources)) },
    });

    return setBasketState({ sources, lines, definitionRows });
  }

  /** The active promotions parsed into set sources: label from the Hungarian
   * name, members from the condition args, the flat amount from the action arg. */
  async activeSources(ctx: RequestContext): Promise<PromotionSource[]> {
    return activeSetSources(ctx, this.connection);
  }
}
