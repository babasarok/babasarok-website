import {
  Allow,
  Ctx,
  Permission,
  PluginCommonModule,
  RequestContext,
  VendurePlugin,
} from "@vendure/core";
import gql from "graphql-tag";
import { ZodError } from "zod";
import { Mutation, Resolver, Args } from "@nestjs/graphql";
import { QuoteOrderService } from "./quote-order.service";

type SubmitQuoteOrderResult =
  | { __typename: "SubmitQuoteOrderSuccess"; orderCode: string }
  | { __typename: "SubmitQuoteOrderError"; errorCode: string; message: string };

@Resolver()
export class QuoteOrderResolver {
  constructor(private quoteOrderService: QuoteOrderService) {}

  @Mutation()
  @Allow(Permission.Public)
  async submitQuoteOrder(
    @Ctx() ctx: RequestContext,
    @Args("input") input: unknown
  ): Promise<SubmitQuoteOrderResult> {
    try {
      const orderCode = await this.quoteOrderService.submit(ctx, input);
      return { __typename: "SubmitQuoteOrderSuccess", orderCode };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          __typename: "SubmitQuoteOrderError",
          errorCode: "VALIDATION",
          message: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        };
      }
      console.error("submitQuoteOrder failed", error);
      return {
        __typename: "SubmitQuoteOrderError",
        errorCode: "INTERNAL",
        message: "A rendelés rögzítése sikertelen. Kérlek, próbáld meg újra.",
      };
    }
  }
}

export const quoteOrderSchema = gql`
  type SubmitQuoteOrderSuccess {
    orderCode: String!
  }

  type SubmitQuoteOrderError {
    errorCode: String!
    message: String!
  }

  union SubmitQuoteOrderResult = SubmitQuoteOrderSuccess | SubmitQuoteOrderError

  input QuoteOrderProductInput {
    slug: String!
    title: String!
    count: Int!
    configText: String!
    unitPrice: Int!
    lineTotal: Int!
  }
  input QuoteOrderInput {
    name: String!
    email: String!
    phone: String!
    products: [QuoteOrderProductInput!]!
    deliveryMethod: String!
    deliveryPrice: Int!
    deliveryFree: Boolean!
    needsAddress: Boolean!
    address: String
    message: String
    setDiscountSummary: String
    totalPrice: Int!
    termsAccepted: Boolean!
    transactionId: String!
  }

  extend type Mutation {
    submitQuoteOrder(input: QuoteOrderInput!): SubmitQuoteOrderResult!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  shopApiExtensions: {
    schema: quoteOrderSchema,
    resolvers: [QuoteOrderResolver],
  },
  providers: [QuoteOrderService],
})
export class QuoteOrderPlugin {}
