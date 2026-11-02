import gql from "graphql-tag";
import { Allow, Ctx, Permission, RequestContext } from "@vendure/core";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ProductGroup } from "./product-group.entity";
import { ProductGroupService } from "./product-group.service";
import type { ProductGroupInputData } from "./validate-product-group";

/** The admin-API projection of a group row (the list fields come from the row). */
export interface ProductGroupGraph {
  id: string;
  groupId: string;
  label: string;
  kind: string;
  discount: number | null;
  productIds: string[];
}

@Resolver(() => ProductGroup)
export class ProductGroupResolver {
  constructor(private productGroupService: ProductGroupService) {}

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productGroups(@Ctx() ctx: RequestContext): Promise<ProductGroupGraph[]> {
    const groups = await this.productGroupService.productGroups(ctx);

    return groups.map(toGraph);
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productGroup(
    @Ctx() ctx: RequestContext,
    @Args("groupId") groupId: string
  ): Promise<ProductGroupGraph | null> {
    const group = await this.productGroupService.productGroup(ctx, groupId);

    return group === null ? null : toGraph(group);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async createProductGroup(
    @Ctx() ctx: RequestContext,
    @Args("groupId") groupId: string,
    @Args("input") input: ProductGroupInputData
  ): Promise<ProductGroupGraph> {
    return toGraph(await this.productGroupService.createProductGroup(ctx, groupId, input));
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async updateProductGroup(
    @Ctx() ctx: RequestContext,
    @Args("groupId") groupId: string,
    @Args("input") input: ProductGroupInputData
  ): Promise<ProductGroupGraph> {
    return toGraph(await this.productGroupService.updateProductGroup(ctx, groupId, input));
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async deleteProductGroup(
    @Ctx() ctx: RequestContext,
    @Args("groupId") groupId: string
  ): Promise<boolean> {
    return this.productGroupService.deleteProductGroup(ctx, groupId);
  }
}

function toGraph(group: ProductGroup): ProductGroupGraph {
  return {
    id: String(group.id),
    groupId: group.groupId,
    label: group.label,
    kind: group.kind,
    discount: group.discount,
    productIds: [...group.productIds],
  };
}

export const productGroupSchema = gql`
  type ProductGroup {
    id: ID!
    groupId: String!
    label: String!
    kind: String!
    discount: Int
    productIds: [String!]!
  }

  input ProductGroupInput {
    label: String!
    kind: String!
    discount: Int
    productIds: [String!]!
  }

  extend type Query {
    productGroups: [ProductGroup!]!
    productGroup(groupId: String!): ProductGroup
  }

  extend type Mutation {
    createProductGroup(groupId: String!, input: ProductGroupInput!): ProductGroup!
    updateProductGroup(groupId: String!, input: ProductGroupInput!): ProductGroup!
    deleteProductGroup(groupId: String!): Boolean!
  }
`;
