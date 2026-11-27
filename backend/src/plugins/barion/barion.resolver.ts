import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Ctx, type RequestContext } from "@vendure/core";
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
    "Starts a Barion Immediate payment for the session's placed order's full total."
    createBarionPaymentIntent: BarionPaymentIntent!
  }

  extend type Query {
    "The session-scoped Barion payment status of an order, by its code."
    barionPaymentStatus(orderCode: String!): BarionPaymentStatus
  }
`;

@Resolver()
export class BarionResolver {
  constructor(private readonly barionService: BarionService) {}

  @Mutation()
  async createBarionPaymentIntent(
    @Ctx() ctx: RequestContext
  ): Promise<{ paymentId: string; gatewayUrl: string }> {
    // Failures travel as coded refusals in the error message (the site owns the wording).
    return this.barionService.createPaymentIntent(ctx);
  }

  @Query()
  async barionPaymentStatus(
    @Ctx() ctx: RequestContext,
    @Args("orderCode") orderCode: string
  ): Promise<{ paymentId: string | null; status: BarionStatus }> {
    return this.barionService.paymentStatus(ctx, orderCode);
  }
}
