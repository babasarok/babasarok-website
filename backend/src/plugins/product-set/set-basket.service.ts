import { Injectable } from "@nestjs/common";
import { Collection, EntityHydrator, Promotion, TransactionalConnection } from "@vendure/core";
import type { Order, RequestContext } from "@vendure/core";
import { IsNull, In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import { SET_PARENT_SLUG } from "./group-parents";
import {
  relevantNativeProductIds,
  setBasketState,
  type BasketLine,
  type SetBasketState,
} from "./set-basket";

@Injectable()
export class SetBasketService {
  constructor(
    private connection: TransactionalConnection,
    private entityHydrator: EntityHydrator
  ) {}

  /** The allocation for an order, read by the promotion and the shop API alike. */
  async stateForOrder(ctx: RequestContext, order: Order): Promise<SetBasketState | undefined> {
    const parent = await this.connection.getRepository(ctx, Collection).findOne({
      relations: { translations: true },
      where: { translations: { slug: SET_PARENT_SLUG } },
    });

    if (parent === null) {
      return undefined;
    }

    const children = await this.connection.getRepository(ctx, Collection).find({
      where: { parentId: parent.id },
      relations: { translations: true },
    });

    await this.entityHydrator.hydrate(ctx, order, {
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
    const definitionRows = await this.connection.getRepository(ctx, ProductDefinition).find({
      select: { nativeProductId: true, definition: true },
      where: { nativeProductId: In(relevantNativeProductIds(lines, children)) },
    });
    const promotions = await this.connection.getRepository(ctx, Promotion).find({
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
  }
}
