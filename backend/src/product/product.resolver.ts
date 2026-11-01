import gql from "graphql-tag";
import { Allow, Ctx, Permission, RequestContext, UserInputError } from "@vendure/core";
import type { ID } from "@vendure/core";
import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ProductDefinition } from "./product.entity";
import { ProductDefinitionService } from "./product-definition.service";

/** Mirrors the dashboard's PaginatedListDataTable contract (spike-proven). */
interface GeneratedVariantListOptionsInput {
  skip?: number | null;
  take?: number | null;
  sort?: unknown;
  filter?: unknown;
}

interface GeneratedVariantListGraph {
  items: Array<{ id: string; name: string; sku: string; price: number }>;
  totalItems: number;
}

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
  syncState: string;
  syncError: string | null;
  stale: boolean;
}

function toGraph(row: ProductDefinition, stale: boolean): ProductDefinitionGraph {
  return {
    id: row.id,
    productId: row.productId,
    label: row.definition.label,
    type: row.definition.type,
    orderable: row.definition.orderable,
    basePrice: row.definition.basePrice,
    nativeProductId: row.nativeProductId,
    definition: row.definition,
    syncState: row.syncState,
    syncError: row.syncError,
    stale,
  };
}

@Resolver(() => ProductDefinition)
export class ProductDefinitionResolver {
  constructor(private productDefinitionService: ProductDefinitionService) {}

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinitions(@Ctx() ctx: RequestContext): Promise<ProductDefinitionGraph[]> {
    const rows = await this.productDefinitionService.productDefinitions(ctx);
    const staleness = await this.productDefinitionService.staleness(ctx, rows);

    return rows.map((row) => toGraph(row, staleness.get(row.productId) ?? false));
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinition(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string
  ): Promise<ProductDefinitionGraph | null> {
    const row = await this.productDefinitionService.productDefinition(ctx, productId);

    if (row === null) {
      return null;
    }

    const staleness = await this.productDefinitionService.staleness(ctx, [row]);

    return toGraph(row, staleness.get(row.productId) ?? false);
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinitionByNativeProduct(
    @Ctx() ctx: RequestContext,
    @Args("nativeProductId", { type: () => Int }) nativeProductId: number
  ): Promise<ProductDefinitionGraph | null> {
    const row = await this.productDefinitionService.productDefinitionByNativeProduct(
      ctx,
      nativeProductId
    );

    if (row === null) {
      return null;
    }

    const staleness = await this.productDefinitionService.staleness(ctx, [row]);

    return toGraph(row, staleness.get(row.productId) ?? false);
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async generatedVariants(
    @Ctx() ctx: RequestContext,
    @Args("productDefinitionId") productDefinitionId: string,
    @Args("options") options: GeneratedVariantListOptionsInput
  ): Promise<GeneratedVariantListGraph> {
    const row = await this.productDefinitionService.productDefinition(ctx, productDefinitionId);

    if (row === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${productDefinitionId}`);
    }

    return this.productDefinitionService.generatedVariantList(ctx, row, options);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async createProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("definition") definition: unknown
  ): Promise<ProductDefinitionGraph> {
    const row = await this.productDefinitionService.createProductDefinition(ctx, definition);
    const staleness = await this.productDefinitionService.staleness(ctx, [row]);

    return toGraph(row, staleness.get(row.productId) ?? false);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async updateProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string,
    @Args("definition") definition: unknown,
    @Args("force", { nullable: true }) force: boolean | null
  ): Promise<ProductDefinitionGraph> {
    const row = await this.productDefinitionService.updateProductDefinition(
      ctx,
      productId,
      definition,
      force
    );
    const staleness = await this.productDefinitionService.staleness(ctx, [row]);

    return toGraph(row, staleness.get(row.productId) ?? false);
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
    syncState: String!
    syncError: String
    stale: Boolean!
  }

  type GeneratedVariant {
    id: ID!
    name: String!
    sku: String!
    price: Int!
  }

  type GeneratedVariantList {
    items: [GeneratedVariant!]!
    totalItems: Int!
  }

  input GeneratedVariantListOptions {
    # Non-null with defaults: the dashboard's PaginatedListDataTable contract
    # types skip/take as plain numbers, so nullable fields fail its constraint.
    skip: Int! = 0
    take: Int! = 20
    # The dashboard's PaginatedListDataTable always sends sort/filter keys;
    # JSON keeps the input tolerant.
    sort: JSON
    filter: JSON
  }

  extend type Query {
    productDefinition(productId: String!): ProductDefinition
    productDefinitions: [ProductDefinition!]!
    productDefinitionByNativeProduct(nativeProductId: Int!): ProductDefinition
    generatedVariants(
      productDefinitionId: String!
      options: GeneratedVariantListOptions!
    ): GeneratedVariantList!
  }

  extend type Mutation {
    createProductDefinition(definition: JSON!): ProductDefinition!
    updateProductDefinition(
      productId: String!
      definition: JSON!
      force: Boolean
    ): ProductDefinition!
    deleteProductDefinition(productId: String!): Boolean!
  }
`;
