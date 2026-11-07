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
import { In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import {
  projectGroups,
  type ProductGroupCollection,
  type ProductGroupProjection,
} from "./product-group-projection";
import { RELATED_PARENT_SLUG } from "./group-parents";
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
    // Discounted sets live on promotions (ADR 0014), related groups on
    // collections under the "Kapcsolódó termékek" parent.
    const sets = await activeSetSources(ctx, this.connection);
    const related = await this.children(ctx, RELATED_PARENT_SLUG);
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
