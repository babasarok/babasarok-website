import {
  Allow,
  Collection,
  Ctx,
  Permission,
  RequestContext,
  TransactionalConnection,
  TranslatorService,
} from "@vendure/core";
import { Query, Resolver } from "@nestjs/graphql";
import { IsNull, In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import {
  projectGroups,
  type ProductGroupCollection,
  type ProductGroupProjection,
} from "./product-group-projection";
import { memberIds, type PromotionSource } from "./set-basket";
import { activeSetSources } from "./set-basket.service";

@Resolver()
export class ShopProductGroupResolver {
  constructor(
    private connection: TransactionalConnection,
    private translator: TranslatorService
  ) {}

  @Query()
  @Allow(Permission.Public)
  async productGroups(@Ctx() ctx: RequestContext): Promise<ProductGroupProjection[]> {
    // Discounted sets live on promotions (ADR 0014); related groups are the
    // private top-level collections (every public one is material navigation).
    const sets = await activeSetSources(ctx, this.connection);
    const related = await this.relatedCollections(ctx);
    const nativeIds = [
      ...sets.flatMap((promotion) => promotion.memberIds.map(Number)),
      ...related.flatMap((child) => memberIds(child.filters) ?? []),
    ];
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
      ...projectPromotions(sets, productIdByNativeId),
      ...projectGroups(related, productIdByNativeId),
    ];
  }

  private async relatedCollections(ctx: RequestContext): Promise<ProductGroupCollection[]> {
    const repository = this.connection.getRepository(ctx, Collection);
    const root = await repository.findOne({ where: { parentId: IsNull() } });

    if (root === null) {
      return [];
    }

    const collections = await repository.find({
      where: { isPrivate: true, parentId: root.id },
      relations: { translations: true },
    });

    return collections.map((collection) => {
      const translated = this.translator.translate(collection, ctx);

      return {
        slug: translated.slug,
        name: translated.name,
        filters: collection.filters,
      };
    });
  }
}

/** A set group per promotion with at least two known members; the promotion
 * id is the group id the site keys everything on. */
function projectPromotions(
  promotions: PromotionSource[],
  productIdByNativeId: ReadonlyMap<number, string>
): ProductGroupProjection[] {
  return promotions.flatMap((promotion) => {
    const productIds = [
      ...new Set(
        promotion.memberIds.flatMap((nativeId) => {
          const productId = productIdByNativeId.get(Number(nativeId));

          return productId === undefined ? [] : [productId];
        })
      ),
    ];

    if (productIds.length < 2) {
      return [];
    }

    return [
      {
        id: promotion.id,
        kind: "set" as const,
        label: promotion.label,
        discount: promotion.amount,
        productIds,
      },
    ];
  });
}
