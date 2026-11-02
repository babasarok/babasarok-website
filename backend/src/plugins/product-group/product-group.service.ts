import { Injectable } from "@nestjs/common";
import {
  I18nError,
  LogLevel,
  Promotion,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import type { ProductGroupDefinition } from "@babasarok/product-definition";
import { In } from "typeorm";
import { ProductDefinition } from "../product/product.entity";
import { ProductGroup } from "./product-group.entity";
import {
  isDiscountedSet,
  promotionGroupIds,
  validateProductGroupInput,
  type ProductGroupInputData,
} from "./validate-product-group";

/** Deletion refusal with a machine-readable code: the dashboard keys its
 * error handling off `extensions.code`, not the message text. */
class ProductGroupInUseError extends I18nError {
  constructor(message: string) {
    super(message, {}, "PRODUCT_GROUP_IN_PROMOTION", LogLevel.Warn);
  }
}

@Injectable()
export class ProductGroupService {
  constructor(private connection: TransactionalConnection) {}

  async productGroups(ctx: RequestContext): Promise<ProductGroup[]> {
    return this.connection.getRepository(ctx, ProductGroup).find({ order: { groupId: "ASC" } });
  }

  async productGroup(ctx: RequestContext, groupId: string): Promise<ProductGroup | null> {
    return this.connection.getRepository(ctx, ProductGroup).findOneBy({ groupId });
  }

  async createProductGroup(
    ctx: RequestContext,
    groupId: string,
    input: ProductGroupInputData
  ): Promise<ProductGroup> {
    const definition = await this.validated(ctx, groupId, input);
    const repo = this.connection.getRepository(ctx, ProductGroup);

    if ((await repo.findOneBy({ groupId })) !== null) {
      throw new UserInputError(`Már létezik termékcsoport ezzel az azonosítóval: ${groupId}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductGroup);
      await txRepo.insert(this.contentValues(definition, groupId));

      return txRepo.findOneByOrFail({ groupId });
    });
  }

  async updateProductGroup(
    ctx: RequestContext,
    groupId: string,
    input: ProductGroupInputData
  ): Promise<ProductGroup> {
    const repo = this.connection.getRepository(ctx, ProductGroup);
    const existing = await repo.findOneBy({ groupId });

    if (existing === null) {
      throw new UserInputError(`Nincs termékcsoport ezzel az azonosítóval: ${groupId}`);
    }

    const definition = await this.validated(ctx, groupId, input);

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductGroup);
      await txRepo.update({ id: existing.id }, this.contentValues(definition, groupId));

      return txRepo.findOneByOrFail({ id: existing.id });
    });
  }

  async deleteProductGroup(ctx: RequestContext, groupId: string): Promise<boolean> {
    const repo = this.connection.getRepository(ctx, ProductGroup);
    const existing = await repo.findOneBy({ groupId });

    if (existing === null) {
      throw new UserInputError(`Nincs termékcsoport ezzel az azonosítóval: ${groupId}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const promotions = await this.connection.getRepository(txCtx, Promotion).find();
      const referencing = promotions
        .filter((promotion) => promotionGroupIds(promotion.conditions).includes(groupId))
        .map((promotion) => promotion.name);

      if (referencing.length > 0) {
        throw new ProductGroupInUseError(
          `A termékcsoport nem törölhető, mert ezek a promóciók hivatkoznak rá: ${referencing.join(", ")}`
        );
      }

      await this.connection.getRepository(txCtx, ProductGroup).delete({ id: existing.id });

      return true;
    });
  }

  private contentValues(
    definition: ProductGroupDefinition,
    groupId: string
  ): {
    groupId: string;
    label: string;
    kind: "discounted-set" | "related-items";
    discount: number | null;
    productIds: string[];
  } {
    return {
      groupId,
      label: definition.label,
      kind: definition.kind,
      discount: isDiscountedSet(definition) ? definition.discount : null,
      productIds: [...definition.productIds],
    };
  }

  private async validated(
    ctx: RequestContext,
    groupId: string,
    input: ProductGroupInputData
  ): Promise<ProductGroupDefinition> {
    const existingProductIds = new Set<string>();
    const rows = input.productIds.length
      ? await this.connection
          .getRepository(ctx, ProductDefinition)
          .find({ where: { productId: In(input.productIds) } })
      : [];

    for (const row of rows) {
      existingProductIds.add(row.productId);
    }

    const result = validateProductGroupInput(groupId, input, existingProductIds);

    if (!result.success) {
      throw new UserInputError(result.errors.join("\n"));
    }

    return result.definition;
  }
}
