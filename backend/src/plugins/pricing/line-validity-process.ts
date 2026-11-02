import { OrderLine, TransactionalConnection } from "@vendure/core";
import type { Injector, OrderProcess, OrderTransitionData } from "@vendure/core";
import { EntityHydrator } from "@vendure/core";
import { valueVariantLine } from "./line-valuation";

/**
 * Refuses to leave AddingItems while a line's product definition changed
 * since it was added and the line can no longer be priced; removing or
 * adjusting the line clears it.
 */
export class LineValidityProcess implements OrderProcess<string> {
  private connection!: TransactionalConnection;
  private entityHydrator!: EntityHydrator;

  init(injector: Injector): void {
    this.connection = injector.get(TransactionalConnection);
    this.entityHydrator = injector.get(EntityHydrator);
  }

  async onTransitionStart(
    fromState: string,
    toState: string,
    { ctx, order }: OrderTransitionData
  ): Promise<string | undefined> {
    if (fromState !== "AddingItems" || toState !== "ArrangingPayment") {
      return undefined;
    }

    const lines = await this.connection.getRepository(ctx, OrderLine).find({
      where: { order: { id: order.id } },
      relations: { productVariant: true },
    });

    for (const line of lines) {
      const valuation = await valueVariantLine(
        { connection: this.connection, entityHydrator: this.entityHydrator },
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
}
