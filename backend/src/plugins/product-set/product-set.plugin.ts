import gql from "graphql-tag";
import {
  Allow,
  Collection,
  Ctx,
  Permission,
  PluginCommonModule,
  RequestContext,
  TransactionalConnection,
  TranslatorService,
  VendurePlugin,
} from "@vendure/core";
import { Query, Resolver } from "@nestjs/graphql";
import { In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import {
  projectGroups,
  type ProductGroupCollection,
  type ProductGroupProjection,
} from "./product-group-projection";
import { memberIds } from "./set-basket";

const SET_PARENT_SLUG = "szettek";
const RELATED_PARENT_SLUG = "kapcsolodo-termekek";

@Resolver()
export class ShopProductGroupResolver {
  constructor(
    private connection: TransactionalConnection,
    private translator: TranslatorService
  ) {}

  @Query()
  @Allow(Permission.Public)
  async productGroups(@Ctx() ctx: RequestContext): Promise<ProductGroupProjection[]> {
    const sets = await this.children(ctx, SET_PARENT_SLUG);
    const related = await this.children(ctx, RELATED_PARENT_SLUG);
    const nativeIds = [...sets, ...related].flatMap((child) => memberIds(child.filters) ?? []);
    const rows = await this.connection.getRepository(ctx, ProductDefinition).find({
      select: { productId: true, nativeProductId: true },
      where: { nativeProductId: In(nativeIds.map(Number)) },
    });
    const productIdByNativeId = new Map(
      rows.flatMap((row) =>
        row.nativeProductId === null ? [] : [[row.nativeProductId, row.productId] as const]
      )
    );

    return [
      ...projectGroups("set", sets, productIdByNativeId),
      ...projectGroups("related", related, productIdByNativeId),
    ];
  }

  private async children(
    ctx: RequestContext,
    parentSlug: string
  ): Promise<ProductGroupCollection[]> {
    const repository = this.connection.getRepository(ctx, Collection);
    const parent = await repository.findOne({
      relations: { translations: true },
      where: { translations: { slug: parentSlug } },
    });

    if (parent === null) {
      return [];
    }

    const children = await repository.find({
      where: { parentId: parent.id },
      relations: { translations: true },
    });

    return children.map((child) => {
      const translated = this.translator.translate(child, ctx);

      return {
        slug: translated.slug,
        name: translated.name,
        filters: child.filters,
        setDiscount: child.customFields.setDiscount,
      };
    });
  }
}

const shopProductGroupSchema = gql`
  type ProductGroup {
    id: String!
    kind: String!
    label: String!
    discount: Int
    productIds: [String!]!
  }

  extend type Query {
    productGroups: [ProductGroup!]!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  shopApiExtensions: {
    schema: shopProductGroupSchema,
    resolvers: [ShopProductGroupResolver],
  },
})
export class ProductSetPlugin {}
