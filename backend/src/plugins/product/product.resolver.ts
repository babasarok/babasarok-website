import gql from "graphql-tag";
import {
  Allow,
  Ctx,
  Permission,
  Product,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RequestContext,
  UserInputError,
} from "@vendure/core";
import type { ID } from "@vendure/core";
import { Args, Info, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import type { GraphQLResolveInfo } from "graphql";
import { ProductDefinition } from "./product.entity";
import { shopThreadColorTypes } from "./thread-color.resolver";
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

/** Whether the operation actually reads `stale`/`driftDetails`: the drift
 * analysis hydrates the product's whole variant matrix (3 000+ variants
 * catalog-wide), so reads that don't display staleness must not pay for it.
 * ponytail: fragment spreads are not descended — the dashboard table and the
 * scripts inline their fields. */
function wantsDrift(info: GraphQLResolveInfo): boolean {
  return info.fieldNodes.some((node) =>
    node.selectionSet?.selections.some(
      (selection) =>
        selection.kind === "Field" &&
        (selection.name.value === "stale" || selection.name.value === "driftDetails")
    )
  );
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
    @Info() info: GraphQLResolveInfo,
    @Args("options") options: ProductDefinitionListOptionsInput
  ): Promise<ProductDefinitionListGraph> {
    const { items, totalItems } = await this.productDefinitionService.productDefinitions(
      ctx,
      options
    );
    const staleness = wantsDrift(info)
      ? await this.productDefinitionService.staleness(ctx, items)
      : undefined;

    return {
      items: items.map((row) => toGraph(row, staleness?.get(row.productId) ?? false)),
      totalItems,
    };
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async productDefinition(
    @Ctx() ctx: RequestContext,
    @Info() info: GraphQLResolveInfo,
    @Args("productId") productId: string
  ): Promise<ProductDefinitionGraph | null> {
    const row = await this.productDefinitionService.productDefinition(ctx, productId);

    if (row === null) {
      return null;
    }

    const analysis = wantsDrift(info)
      ? (await this.productDefinitionService.driftAnalysis(ctx, [row])).get(row.productId)
      : undefined;

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
    @Info() info: GraphQLResolveInfo,
    @Args("definition") definition: unknown,
    @Args("name") name: string
  ): Promise<ProductDefinitionGraph> {
    const row = await this.productDefinitionService.createProductDefinition(ctx, definition, name);
    const staleness = wantsDrift(info)
      ? await this.productDefinitionService.staleness(ctx, [row])
      : undefined;

    return toGraph(row, staleness?.get(row.productId) ?? false);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async updateProductDefinition(
    @Ctx() ctx: RequestContext,
    @Info() info: GraphQLResolveInfo,
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
    const staleness = wantsDrift(info)
      ? await this.productDefinitionService.staleness(ctx, [row])
      : undefined;

    return toGraph(row, staleness?.get(row.productId) ?? false);
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

interface ShopVariantOptionGraph {
  code: string;
  group: string;
}

/** The site-facing variant matrix entry: the variant id and its option axes. */
interface ShopVariantOptionsGraph {
  id: string;
  options: ShopVariantOptionGraph[];
}

@Resolver()
export class ShopProductVariantsResolver {
  constructor(
    private productService: ProductService,
    private productVariantService: ProductVariantService
  ) {}

  /**
   * The product's full variant matrix. Vendure's own `Product.variants` field
   * resolves with the shop list-query limit and takes no paging arguments, so
   * a matrix larger than the limit is invisible to the shop API — the
   * configurator needs every variant to match the buyer's configuration.
   */
  @Query()
  @Allow(Permission.Public)
  async productVariants(
    @Ctx() ctx: RequestContext,
    @Args("slug") slug: string
  ): Promise<ShopVariantOptionsGraph[]> {
    const product = await this.productService.findOneBySlug(ctx, slug, []);

    if (product === undefined || !product.enabled) {
      return [];
    }

    const variants: ProductVariant[] = [];
    let totalItems = Number.POSITIVE_INFINITY;

    while (variants.length < totalItems) {
      const page = await this.productVariantService.getVariantsByProductId(
        ctx,
        Number(product.id),
        { skip: variants.length },
        ["options", "options.group"]
      );

      variants.push(...page.items);
      totalItems = page.totalItems;

      if (page.items.length === 0) {
        break;
      }
    }

    return variants.map((variant) => ({
      id: String(variant.id),
      options: variant.options.map((option) => ({
        code: option.code,
        group: option.group.code,
      })),
    }));
  }
}

export const shopProductSchema = gql`
  type ShopVariantOption {
    code: String!
    group: String!
  }

  type ShopVariantOptions {
    id: ID!
    options: [ShopVariantOption!]!
  }

  extend type Query {
    productVariants(slug: String!): [ShopVariantOptions!]!
  }

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

  type ProductDefinitionSyncProgress {
    done: Int!
    total: Int!
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
