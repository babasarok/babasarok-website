import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Ctx, Order, OrderService, Relations, type RequestContext } from "@vendure/core";
import type { EntityRelationPaths } from "@vendure/core";
import gql from "graphql-tag";
import type { BarionStatus } from "./barion-payment-items";
import { BarionService } from "./barion.service";

export const barionShopSchema = gql`
  type BarionPaymentIntent {
    paymentId: String!
    gatewayUrl: String!
  }

  type BarionPaymentStatus {
    paymentId: String
    status: String!
  }

  extend type Mutation {
    "Starts a Barion Immediate payment for the placed order's full total, addressed by its code."
    createBarionPaymentIntent(orderCode: String!): BarionPaymentIntent!
  }

  extend type Query {
    "The session-scoped Barion payment status of an order, by its code."
    barionPaymentStatus(orderCode: String!): BarionPaymentStatus

    "The caller's unpaid Barion order, for the basket's fallback rendering."
    barionPendingOrder: Order
  }
`;

@Resolver()
export class BarionResolver {
  constructor(
    private readonly barionService: BarionService,
    private readonly orderService: OrderService
  ) {}

  @Mutation()
  async createBarionPaymentIntent(
    @Ctx() ctx: RequestContext,
    @Args("orderCode") orderCode: string
  ): Promise<{ paymentId: string; gatewayUrl: string }> {
    // Failures travel as coded refusals in the error message (the site owns the wording).
    return this.barionService.createPaymentIntent(ctx, orderCode);
  }

  @Query()
  async barionPendingOrder(
    @Ctx() ctx: RequestContext,
    @Relations({ entity: Order, omit: ["aggregateOrder", "sellerOrders"] })
    relations: EntityRelationPaths<Order>[]
  ): Promise<Order | null> {
    const id = await this.barionService.pendingOrderId(ctx);

    if (id === null) {
      return null;
    }

    return (await this.orderService.findOne(ctx, id, relations)) ?? null;
  }

  @Query()
  async barionPaymentStatus(
    @Ctx() ctx: RequestContext,
    @Args("orderCode") orderCode: string
  ): Promise<{ paymentId: string | null; status: BarionStatus }> {
    return this.barionService.paymentStatus(ctx, orderCode);
  }
}
