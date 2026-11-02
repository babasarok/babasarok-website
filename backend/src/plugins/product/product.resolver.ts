import gql from "graphql-tag";
import { Allow, Ctx, Permission, Product, RequestContext, UserInputError } from "@vendure/core";
import type { ID } from "@vendure/core";
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { ProductDefinition } from "./product.entity";
import { ProductDefinitionService } from "./product-definition.service";
import type { SyncProgress } from "./sync-progress";

/** Mirrors the dashboard's PaginatedListDataTable contract (spike-proven). */
interface GeneratedVariantListOptionsInput {
  skip?: number | null;
  take?: number | null;
  sort?: unknown;
  filter?: unknown;
}

interface GeneratedVariantListGraph {
  items: Array<{ id: string; name: string; code: string; price: number; facets: string }>;
  totalItems: number;
}

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
  orderable: boolean;
  basePrice: number;
  nativeProductId: number | null;
  definition: unknown;
  syncState: string;
  syncError: string | null;
  syncProgress: SyncProgress | null;
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
  driftDetails: ProductDefinitionDriftGraph[] = [],
  syncProgress: SyncProgress | null = null
): ProductDefinitionGraph {
  return {
    id: row.id,
    productId: row.productId,
    label: row.label,
    orderable: row.definition.orderable,
    basePrice: row.definition.basePrice,
    nativeProductId: row.nativeProductId,
    definition: row.definition,
    syncState: row.syncState,
    syncError: row.syncError,
    syncProgress,
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

    const analysis = (await this.productDefinitionService.driftAnalysis(ctx, [row])).get(
      row.productId
    );

    return toGraph(
      row,
      analysis?.stale ?? false,
      analysis?.details ?? [],
      row.syncState === "pending"
        ? await this.productDefinitionService.syncProgress(productId)
        : null
    );
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

export const productDefinitionSchema = gql`
  # The Node/PaginatedList implementations are what the dashboard's table
  # machinery keys on (the admin-api schema plugin marks list types by the
  # PaginatedList interface); without them the lists render without columns.
  type ProductDefinitionDrift {
    kind: String!
    label: String!
  }

  type ProductDefinitionSyncProgress {
    done: Int!
    total: Int!
  }

  type ProductDefinition implements Node {
    id: ID!
    productId: String!
    label: String!
    orderable: Boolean!
    basePrice: Int!
    nativeProductId: Int
    definition: JSON!
    syncState: String!
    syncError: String
    syncProgress: ProductDefinitionSyncProgress
    stale: Boolean!
    driftDetails: [ProductDefinitionDrift!]
  }

  type GeneratedVariant implements Node {
    id: ID!
    name: String!
    # "code", not "sku": the dashboard's shipped table settings for the
    # product-detail page hide a column literally named "sku" (the stock
    # variants table's default), and a table column inherits the page's
    # settings by id — a colliding name renders as a hidden column and the
    # table's minimal-query rewrite stops fetching it.
    code: String!
    price: Int!
    facets: String!
  }

  type GeneratedVariantList implements PaginatedList {
    items: [GeneratedVariant!]!
    totalItems: Int!
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
    productDefinitions(options: ProductDefinitionListOptions!): ProductDefinitionList!
    generatedVariants(
      productDefinitionId: String!
      options: GeneratedVariantListOptions!
    ): GeneratedVariantList!
  }

  extend type Product {
    productDefinition: ProductDefinition
  }

  extend type Mutation {
    createProductDefinition(definition: JSON!, name: String!): ProductDefinition!
    updateProductDefinition(
      productId: String!
      definition: JSON!
      force: Boolean
    ): ProductDefinition!
    deleteProductDefinition(productId: String!): Boolean!
  }
`;
