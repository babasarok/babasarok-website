import { OrderLine, TransactionalConnection } from "@vendure/core";
import type {
  ID,
  Injector,
  OrderProcess,
  OrderTransitionData,
  RequestContext,
} from "@vendure/core";
import { EntityHydrator } from "@vendure/core";
import { lineValuationDeps, valueVariantLine, type LineValuationDeps } from "./line-valuation";

export interface LineValidityDeps extends LineValuationDeps {
  findLines(ctx: RequestContext, orderId: ID): Promise<OrderLine[]>;
}

export async function refuseInvalidLines(
  deps: LineValidityDeps,
  fromState: string,
  toState: string,
  { ctx, order }: OrderTransitionData
): Promise<string | undefined> {
  if (fromState !== "AddingItems" || toState !== "ArrangingPayment") {
    return undefined;
  }

  for (const line of await deps.findLines(ctx, order.id)) {
    const valuation = await valueVariantLine(
      deps,
      ctx,
      line.productVariant,
      Object.fromEntries(Object.entries(line.customFields)),
      0
    );

    if (valuation.kind === "invalid") {
      return valuation.message;
    }
  }

  return undefined;
}

/**
 * Refuses to leave AddingItems while a line's product definition changed
 * since it was added and the line can no longer be priced; removing or
 * adjusting the line clears it.
 */
export class LineValidityProcess implements OrderProcess<string> {
  private deps!: LineValidityDeps;

  init(injector: Injector): void {
    const connection = injector.get(TransactionalConnection);

    this.deps = {
      ...lineValuationDeps(connection, injector.get(EntityHydrator)),
      findLines: (ctx, orderId) =>
        connection.getRepository(ctx, OrderLine).find({
          where: { order: { id: orderId } },
          relations: { productVariant: true },
        }),
    };
  }

  onTransitionStart(
    fromState: string,
    toState: string,
    data: OrderTransitionData
  ): Promise<string | undefined> {
    return refuseInvalidLines(this.deps, fromState, toState, data);
  }
}
