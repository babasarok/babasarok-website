import gql from "graphql-tag";
import { Allow, Ctx, Permission, Product, RequestContext } from "@vendure/core";
import type { ID } from "@vendure/core";
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { ProductDefinition } from "./product.entity";
import { shopThreadColorTypes } from "./thread-color.resolver";
import { ProductDefinitionService } from "./product-definition.service";

/** Mirrors the dashboard's PaginatedListDataTable contract (spike-proven). */
interface ProductDefinitionListOptionsInput {
  skip?: number | null;
  take?: number | null;
  sort?: unknown;
  filter?: unknown;
}

interface ProductDefinitionListGraph {
  items: ProductDefinitionGraph[];
  totalItems: number;
}

/** The admin-API projection of a definition row; `label` is the native
 * product's hu name (ADR 0011 decision 1), the rest comes from the definition. */
export interface ProductDefinitionGraph {
  id: ID;
  productId: string;
  label: string;
  basePrice: number;
  nativeProductId: number | null;
  definition: unknown;
  syncState: string;
  syncError: string | null;
  stale: boolean;
  driftDetails: ProductDefinitionDriftGraph[];
}

export interface ProductDefinitionDriftGraph {
  kind: string;
  label: string;
}

function toGraph(
  row: ProductDefinition,
  stale: boolean,
  driftDetails: ProductDefinitionDriftGraph[] = []
): ProductDefinitionGraph {
  return {
    id: row.id,
    productId: row.productId,
    label: row.label,
    basePrice: row.definition.basePrice,
    nativeProductId: row.nativeProductId,
    definition: row.definition,
    syncState: row.syncState,
    syncError: row.syncError,
    stale,
    driftDetails,
  };
}

@Resolver(() => ProductDefinition)
export class ProductDefinitionResolver {
  constructor(private productDefinitionService: ProductDefinitionService) {}

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinitions(
    @Ctx() ctx: RequestContext,
    @Args("options") options: ProductDefinitionListOptionsInput
  ): Promise<ProductDefinitionListGraph> {
    const { items, totalItems } = await this.productDefinitionService.productDefinitions(
      ctx,
      options
    );
    const staleness = await this.productDefinitionService.staleness(ctx, items);

    return {
      items: items.map((row) => toGraph(row, staleness.get(row.productId) ?? false)),
      totalItems,
    };
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

    const drift =
      (await this.productDefinitionService.driftAnalysis(ctx, [row])).get(row.productId) ?? [];

    return toGraph(row, drift.length > 0, drift);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async createProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("definition") definition: unknown,
    @Args("name") name: string
  ): Promise<ProductDefinitionGraph> {
    const row = await this.productDefinitionService.createProductDefinition(ctx, definition, name);
    const staleness = await this.productDefinitionService.staleness(ctx, [row]);

    return toGraph(row, staleness.get(row.productId) ?? false);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async updateProductDefinition(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string,
    @Args("definition") definition: unknown
  ): Promise<ProductDefinitionGraph> {
    const row = await this.productDefinitionService.updateProductDefinition(
      ctx,
      productId,
      definition
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

/** Exposes the definition that generated a native product on the stock
 * Product type, so the dashboard's product-detail query can carry the
 * generated flag (and the definition id) to its page blocks synchronously. */
@Resolver(() => Product)
export class ProductFieldResolver {
  constructor(private productDefinitionService: ProductDefinitionService) {}

  @ResolveField(() => ProductDefinition, { nullable: true, name: "productDefinition" })
  @Allow(Permission.ReadCatalog)
  async productDefinition(
    @Ctx() ctx: RequestContext,
    @Parent() product: Product
  ): Promise<ProductDefinitionGraph | null> {
    const row = await this.productDefinitionService.productDefinitionByNativeProduct(
      ctx,
      Number(product.id)
    );

    return row === null ? null : toGraph(row, false);
  }
}

@Resolver("Product")
export class ShopProductFieldResolver {
  constructor(private productDefinitionService: ProductDefinitionService) {}

  @ResolveField()
  @Allow(Permission.Public)
  async productDefinition(
    @Ctx() ctx: RequestContext,
    @Parent() product: Product
  ): Promise<unknown> {
    const definitions = await this.productDefinitionService.definitionsByNativeProduct(ctx);

    return definitions.get(Number(product.id)) ?? null;
  }
}

export const shopProductSchema = gql`
  extend type Product {
    productDefinition: JSON
  }

  ${shopThreadColorTypes}
`;

export const productDefinitionSchema = gql`
  # The Node/PaginatedList implementations are what the dashboard's table
  # machinery keys on (the admin-api schema plugin marks list types by the
  # PaginatedList interface); without them the lists render without columns.
  type ProductDefinitionDrift {
    kind: String!
    label: String!
  }

  type ProductDefinition implements Node {
    id: ID!
    productId: String!
    label: String!
    basePrice: Int!
    nativeProductId: Int
    definition: JSON!
    syncState: String!
    syncError: String
    stale: Boolean!
    driftDetails: [ProductDefinitionDrift!]
  }

  type ProductDefinitionList implements PaginatedList {
    items: [ProductDefinition!]!
    totalItems: Int!
  }

  input ProductDefinitionListOptions {
    # Non-null with defaults: the dashboard's PaginatedListDataTable contract
    # types skip/take as plain numbers, so nullable fields fail its constraint.
    skip: Int! = 0
    take: Int! = 20
    # The table always sends sort/filter keys; JSON keeps the input tolerant.
    sort: JSON
    filter: JSON
  }

  extend type Query {
    productDefinition(productId: String!): ProductDefinition
    productDefinitions(options: ProductDefinitionListOptions!): ProductDefinitionList!
  }

  extend type Product {
    productDefinition: ProductDefinition
  }

  extend type Mutation {
    createProductDefinition(definition: JSON!, name: String!): ProductDefinition!
    updateProductDefinition(productId: String!, definition: JSON!): ProductDefinition!
    deleteProductDefinition(productId: String!): Boolean!
  }
`;
