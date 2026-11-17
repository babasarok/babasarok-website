import { Injectable } from "@nestjs/common";
import { OrderLine, ProductVariantService, TransactionalConnection } from "@vendure/core";
import type { ID, RequestContext } from "@vendure/core";
import { DatabaseLineFacts } from "./database-line-facts";
import {
  lineInvalidReason,
  type LineInvalidReason,
  type LineInvalidReasonDeps,
  type LineInvalidReasonOptions,
} from "./line-invalid-reason";
import { lineValuationDeps } from "./line-valuation";

@Injectable()
export class LineInvalidReasonService {
  private deps: LineInvalidReasonDeps;

  constructor(
    private connection: TransactionalConnection,
    private productVariantService: ProductVariantService
  ) {
    this.deps = {
      ...lineValuationDeps(connection),
      lineFacts: (ctx) => new DatabaseLineFacts(connection, ctx),
      saleableStock: (ctx, variant, lock) =>
        this.productVariantService.getSaleableStockLevel(
          ctx,
          variant,
          lock ? { lockStockLevels: true } : undefined
        ),
    };
  }

  async reasonForLine(
    ctx: RequestContext,
    lineId: ID,
    options: LineInvalidReasonOptions = {}
  ): Promise<LineInvalidReason | undefined> {
    const line = await this.connection.getRepository(ctx, OrderLine).findOne({
      where: { id: lineId },
      relations: { productVariant: true },
      withDeleted: true,
    });

    if (line === null) {
      return undefined;
    }

    return lineInvalidReason(this.deps, ctx, line, options);
  }

  async firstReasonForOrder(
    ctx: RequestContext,
    orderId: ID,
    options: LineInvalidReasonOptions = {}
  ): Promise<LineInvalidReason | undefined> {
    const lines = await this.connection.getRepository(ctx, OrderLine).find({
      where: { order: { id: orderId } },
      relations: { productVariant: true },
      withDeleted: true,
    });

    for (const line of lines) {
      const reason = await lineInvalidReason(this.deps, ctx, line, options);

      if (reason !== undefined) {
        return reason;
      }
    }

    return undefined;
  }
}
