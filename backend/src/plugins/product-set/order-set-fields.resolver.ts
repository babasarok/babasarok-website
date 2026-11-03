import { Ctx, Order, OrderLine, RequestContext, TransactionalConnection } from "@vendure/core";
import { Parent, ResolveField, Resolver } from "@nestjs/graphql";
import { SetBasketService } from "./set-basket.service";
import { instanceViews, type LineSetState, type SetInstanceView } from "./set-line-states";

export const orderSetFieldsSdl = `
  type SetDiscountLineUnits {
    orderLineId: ID!
    units: Int!
  }

  type SetDiscountInstance {
    groupId: ID!
    title: String!
    amount: Money!
    lines: [SetDiscountLineUnits!]!
  }

  enum OrderLineSetStateKind {
    ACTIVE
    PENDING_PARTNER
    PENDING_MATERIAL
  }

  type OrderLineSetState {
    kind: OrderLineSetStateKind!
    groupId: ID!
    title: String!
    coveredUnits: Int!
    materialSyncFromLineId: ID
  }

  extend type Order {
    setDiscounts: [SetDiscountInstance!]!
  }

  extend type OrderLine {
    setState: OrderLineSetState
  }
`;

const KIND = {
  active: "ACTIVE",
  "pending-partner": "PENDING_PARTNER",
  "pending-material": "PENDING_MATERIAL",
} as const satisfies Record<LineSetState["kind"], string>;

@Resolver("Order")
export class OrderSetDiscountsResolver {
  constructor(private setBasket: SetBasketService) {}

  @ResolveField()
  async setDiscounts(
    @Ctx() ctx: RequestContext,
    @Parent() order: Order
  ): Promise<
    Array<{
      groupId: string;
      title: string;
      amount: number;
      lines: Array<{ orderLineId: string; units: number }>;
    }>
  > {
    const state = await this.setBasket.stateForOrder(ctx, order);

    return instanceViews(state?.instances ?? []).map((view: SetInstanceView) => ({
      groupId: view.groupId,
      title: view.title,
      amount: view.amount,
      lines: view.lines.map((line) => ({ orderLineId: line.lineId, units: line.units })),
    }));
  }
}

@Resolver("OrderLine")
export class OrderLineSetStateResolver {
  constructor(
    private setBasket: SetBasketService,
    private connection: TransactionalConnection
  ) {}

  // ponytail: recomputes the allocation per line; fine for baskets of a few lines, memoize per request if it shows up.
  @ResolveField()
  async setState(@Ctx() ctx: RequestContext, @Parent() line: OrderLine) {
    const { order } = await this.connection.getEntityOrThrow(ctx, OrderLine, line.id, {
      relations: { order: true },
    });
    const state = (await this.setBasket.stateForOrder(ctx, order))?.lineStates.get(String(line.id));

    if (state === undefined) {
      return null;
    }

    return {
      kind: KIND[state.kind],
      groupId: state.groupId,
      title: state.title,
      coveredUnits: state.kind === "active" ? state.coveredUnits : 0,
      materialSyncFromLineId:
        state.kind === "pending-material" ? state.materialSyncFromLineId : null,
    };
  }
}
