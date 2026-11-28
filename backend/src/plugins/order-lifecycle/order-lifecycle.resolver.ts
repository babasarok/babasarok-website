import { Allow, Ctx, ID, Order, Permission, RequestContext } from "@vendure/core";
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { OrderLifecycleService } from "./order-lifecycle.service";

@Resolver()
export class OrderLifecycleResolver {
  constructor(private readonly orderLifecycleService: OrderLifecycleService) {}

  @Mutation()
  @Allow(Permission.UpdateOrder)
  recordDepositPayment(
    @Ctx() ctx: RequestContext,
    @Args("orderId") orderId: ID,
    @Args("transactionId", { nullable: true }) transactionId?: string
  ): Promise<Order> {
    return this.orderLifecycleService.recordDepositPayment(ctx, orderId, transactionId);
  }

  @Mutation()
  @Allow(Permission.UpdateOrder)
  markFulfillmentStarted(@Ctx() ctx: RequestContext, @Args("orderId") orderId: ID): Promise<Order> {
    return this.orderLifecycleService.markFulfillmentStarted(ctx, orderId);
  }
}

export const orderLifecycleSchema = /* GraphQL */ `
  extend type Mutation {
    "Records the order's delivery variant's deposit as a settled bank-transfer payment and moves the order to DepositPaid."
    recordDepositPayment(orderId: ID!, transactionId: String): Order!

    "Stamps the time the owner started making the product (idempotent)."
    markFulfillmentStarted(orderId: ID!): Order!
  }
`;
