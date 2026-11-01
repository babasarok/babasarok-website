import gql from "graphql-tag";
import { Allow, Ctx, Permission, RequestContext } from "@vendure/core";
import type { ID } from "@vendure/core";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ProductDefinition } from "./product.entity";
import { ProductDefinitionService } from "./product-definition.service";

/** The admin-API projection of a definition row (the list fields come from the definition itself). */
export interface ProductDefinitionGraph {
  id: ID;
  productId: string;
  label: string;
  type: string;
  orderable: boolean;
  basePrice: number;
  nativeProductId: number | null;
  definition: unknown;
}

function toGraph(row: ProductDefinition): ProductDefinitionGraph {
  return {
    id: row.id,
    productId: row.productId,
    label: row.definition.label,
    type: row.definition.type,
    orderable: row.definition.orderable,
    basePrice: row.definition.basePrice,
    nativeProductId: row.nativeProductId,
    definition: row.definition,
  };
}

@Resolver(() => ProductDefinition)
export class ProductDefinitionResolver {
  constructor(private productDefinitionService: ProductDefinitionService) {}

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinitions(@Ctx() ctx: RequestContext): Promise<ProductDefinitionGraph[]> {
    return (await this.productDefinitionService.productDefinitions(ctx)).map(toGraph);
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinition(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string
  ): Promise<ProductDefinitionGraph | null> {
    const row = await this.productDefinitionService.productDefinition(ctx, productId);

    return row === null ? null : toGraph(row);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async createProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("definition") definition: unknown
  ): Promise<ProductDefinitionGraph> {
    return toGraph(await this.productDefinitionService.createProductDefinition(ctx, definition));
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async updateProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string,
    @Args("definition") definition: unknown
  ): Promise<ProductDefinitionGraph> {
    return toGraph(
      await this.productDefinitionService.updateProductDefinition(ctx, productId, definition)
    );
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async deleteProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string
  ): Promise<boolean> {
    return this.productDefinitionService.deleteProductDefinition(ctx, productId);
  }
}

export const productDefinitionSchema = gql`
  type ProductDefinition {
    id: ID!
    productId: String!
    label: String!
    type: String!
    orderable: Boolean!
    basePrice: Int!
    nativeProductId: Int
    definition: JSON!
  }

  extend type Query {
    productDefinition(productId: String!): ProductDefinition
    productDefinitions: [ProductDefinition!]!
  }

  extend type Mutation {
    createProductDefinition(definition: JSON!): ProductDefinition!
    updateProductDefinition(productId: String!, definition: JSON!): ProductDefinition!
    deleteProductDefinition(productId: String!): Boolean!
  }
`;
