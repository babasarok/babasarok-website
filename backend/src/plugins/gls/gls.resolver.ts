import { Args, Query, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, Permission, type RequestContext } from "@vendure/core";
import gql from "graphql-tag";
import { GlsService, type GlsLabelFile } from "./gls.service";

export const glsAdminSchema = gql`
  type GlsLabelFile {
    fileName: String!
    base64: String!
  }

  extend type Query {
    "The stored GLS label PDF of a fulfillment; null once delivered, cancelled, or not a GLS fulfillment."
    glsLabel(fulfillmentId: ID!): GlsLabelFile
  }
`;

@Resolver()
export class GlsResolver {
  constructor(private readonly glsService: GlsService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async glsLabel(
    @Ctx() ctx: RequestContext,
    @Args("fulfillmentId") fulfillmentId: string
  ): Promise<GlsLabelFile | null> {
    return (await this.glsService.labelFile(ctx, fulfillmentId)) ?? null;
  }
}
