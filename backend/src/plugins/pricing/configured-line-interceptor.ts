import { TransactionalConnection } from "@vendure/core";
import type {
  Injector,
  Order,
  OrderInterceptor,
  RequestContext,
  WillAddItemToOrderInput,
  WillAdjustOrderLineInput,
} from "@vendure/core";
import { DatabaseLineFacts } from "./database-line-facts";
import { encodeRefusal } from "../../shared/refusal";
import { lineRejection, type LineCheckInput } from "./line-rejection";

/**
 * Rejects unpriceable configured lines at the mutation boundary with a clear
 * error result (OrderInterceptorError) instead of a thrown price calculation:
 * a length-priced product requires the line's length, and the selections must
 * parse with embroidery thread colors the thread-color facet knows (ADR 0011
 * decision 3). The pricing strategy re-checks these as the backstop.
 */
export class ConfiguredOrderLineInterceptor implements OrderInterceptor {
  private connection!: TransactionalConnection;

  init(injector: Injector): void {
    this.connection = injector.get(TransactionalConnection);
  }

  willAddItemToOrder(
    ctx: RequestContext,
    order: Order,
    input: WillAddItemToOrderInput
  ): Promise<string | undefined> {
    return this.rejection(ctx, {
      productId: Number(input.productVariant.productId),
      languageCode: ctx.languageCode,
      customFields: input.customFields,
    });
  }

  willAdjustOrderLine(
    ctx: RequestContext,
    order: Order,
    input: WillAdjustOrderLineInput
  ): Promise<string | undefined> {
    return this.rejection(ctx, {
      productId: Number(input.orderLine.productVariant.productId),
      languageCode: ctx.languageCode,
      customFields: input.customFields,
      storedLengthCm: input.orderLine.customFields.lengthCm,
    });
  }

  private async rejection(ctx: RequestContext, input: LineCheckInput): Promise<string | undefined> {
    const refusal = await lineRejection(this.facts(ctx), input);

    return refusal === undefined ? undefined : encodeRefusal(refusal);
  }

  private facts(ctx: RequestContext): DatabaseLineFacts {
    return new DatabaseLineFacts(this.connection, ctx);
  }
}
