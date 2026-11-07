import { Injectable } from "@nestjs/common";
import { EntityHydrator, OrderLine, TransactionalConnection } from "@vendure/core";
import type { ID, RequestContext } from "@vendure/core";
import { DatabaseLineFacts } from "./database-line-facts";
import {
  lineInvalidReason,
  type LineInvalidReason,
  type LineInvalidReasonDeps,
} from "./line-invalid-reason";
import { lineValuationDeps } from "./line-valuation";

@Injectable()
export class LineInvalidReasonService {
  private deps: LineInvalidReasonDeps;

  constructor(
    private connection: TransactionalConnection,
    entityHydrator: EntityHydrator
  ) {
    this.deps = {
      ...lineValuationDeps(connection, entityHydrator),
      lineFacts: (ctx) => new DatabaseLineFacts(connection, ctx),
    };
  }

  async reasonForLine(ctx: RequestContext, lineId: ID): Promise<LineInvalidReason | undefined> {
    const line = await this.connection.getRepository(ctx, OrderLine).findOne({
      where: { id: lineId },
      relations: { productVariant: true },
      withDeleted: true,
    });

    if (line === null) {
      return undefined;
    }

    return lineInvalidReason(this.deps, ctx, line);
  }

  async firstReasonForOrder(
    ctx: RequestContext,
    orderId: ID
  ): Promise<LineInvalidReason | undefined> {
    const lines = await this.connection.getRepository(ctx, OrderLine).find({
      where: { order: { id: orderId } },
      relations: { productVariant: true },
      withDeleted: true,
    });

    for (const line of lines) {
      const reason = await lineInvalidReason(this.deps, ctx, line);

      if (reason !== undefined) {
        return reason;
      }
    }

    return undefined;
  }
}
