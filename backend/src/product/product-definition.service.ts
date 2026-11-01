import { Injectable } from "@nestjs/common";
import {
  LanguageCode,
  Product,
  ProductOptionGroupService,
  ProductOptionService,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { IsNull } from "typeorm";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { Material } from "../material/material.entity";
import { validateProductDefinition } from "./product-definition";
import { ProductDefinition } from "./product.entity";
import { definitionHash, nativeStateHash, type NativeProductState } from "./sync-state";
import { planVariantCombinations, type VariantPlan } from "./variant-plan";

function huName(
  translations: Array<{ languageCode: LanguageCode; name: string }> | undefined
): string | undefined {
  return translations?.find((translation) => translation.languageCode === LanguageCode.hu)?.name;
}

/** The variant writes per ProductVariantService call — the spike's per-variant loop is not shippable. */
const BATCH_SIZE = 100;

@Injectable()
export class ProductDefinitionService {
  constructor(
    private connection: TransactionalConnection,
    private productService: ProductService,
    private optionGroupService: ProductOptionGroupService,
    private optionService: ProductOptionService,
    private variantService: ProductVariantService
  ) {}

  async productDefinitions(ctx: RequestContext): Promise<ProductDefinition[]> {
    return this.connection
      .getRepository(ctx, ProductDefinition)
      .find({ order: { productId: "ASC" } });
  }

  async productDefinition(
    ctx: RequestContext,
    productId: string
  ): Promise<ProductDefinition | null> {
    return this.connection.getRepository(ctx, ProductDefinition).findOneBy({ productId });
  }

  async createProductDefinition(ctx: RequestContext, input: unknown): Promise<ProductDefinition> {
    const definition = await this.validated(input, ctx);
    const repo = this.connection.getRepository(ctx, ProductDefinition);

    if ((await repo.findOneBy({ productId: definition.id })) !== null) {
      throw new UserInputError(`Már létezik termék ezzel az azonosítóval: ${definition.id}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      const nativeProductId = await this.createNativeProduct(txCtx, definition);
      await txRepo.insert({ productId: definition.id, definition, nativeProductId });

      await this.sync(txCtx, nativeProductId, definition);
      await this.recordSyncState(txCtx, definition.id, nativeProductId, definition);

      return txRepo.findOneByOrFail({ productId: definition.id });
    });
  }

  async updateProductDefinition(
    ctx: RequestContext,
    productId: string,
    input: unknown,
    force?: boolean | null
  ): Promise<ProductDefinition> {
    const repo = this.connection.getRepository(ctx, ProductDefinition);
    const existing = await repo.findOneBy({ productId });

    if (existing === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${productId}`);
    }

    const definition = await this.validated(input, ctx);

    if (definition.id !== productId) {
      throw new UserInputError("A termékazonosító nem módosítható.");
    }

    if (existing.nativeProductId !== null) {
      await this.assertNoNativeDrift(ctx, existing.nativeProductId, existing, force === true);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      await txRepo.update({ productId }, { definition });

      let nativeProductId = existing.nativeProductId;

      if (nativeProductId === null) {
        nativeProductId = await this.createNativeProduct(txCtx, definition);
        await txRepo.update({ productId }, { nativeProductId });
      } else if (existing.definition.label !== definition.label) {
        await this.productService.update(txCtx, {
          id: nativeProductId,
          translations: [{ languageCode: LanguageCode.hu, name: definition.label }],
        });
      }

      await this.sync(txCtx, nativeProductId, definition);
      await this.recordSyncState(txCtx, productId, nativeProductId, definition);

      return txRepo.findOneByOrFail({ productId });
    });
  }

  async deleteProductDefinition(ctx: RequestContext, productId: string): Promise<boolean> {
    const repo = this.connection.getRepository(ctx, ProductDefinition);
    const existing = await repo.findOneBy({ productId });

    if (existing === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${productId}`);
    }

    await this.connection.withTransaction(ctx, async (txCtx) => {
      await this.connection.getRepository(txCtx, ProductDefinition).delete({ productId });

      if (existing.nativeProductId !== null) {
        await this.productService.softDelete(txCtx, existing.nativeProductId);
      }
    });

    return true;
  }

  /**
   * Refuses to sync when the native product was edited outside the sync
   * (ADR 0010: drift is flagged, never silently overwritten). `force`
   * confirms the overwrite; the sync then restores the generated state.
   */
  private async assertNoNativeDrift(
    ctx: RequestContext,
    nativeProductId: number,
    existing: ProductDefinition,
    force: boolean
  ): Promise<void> {
    if (force || existing.syncedNativeStateHash === null) {
      return;
    }

    const state = await this.currentNativeState(ctx, nativeProductId);

    if (nativeStateHash(state) !== existing.syncedNativeStateHash) {
      throw new UserInputError(
        `A(z) "${existing.productId}" termék natív adatai (opciók, változatok, árak) a ` +
          "szinkronizáláson kívül módosultak. A felülírásukhoz hagyd jóvá a szinkronizálást."
      );
    }
  }

  /** Creates the native Vendure Product the definition generates. */
  private async createNativeProduct(
    ctx: RequestContext,
    definition: CanonicalProductDefinition
  ): Promise<number> {
    const product = await this.productService.create(ctx, {
      // description: "" — the column is NOT NULL and the admin UI always
      // sends the empty string; CreateProductInput leaves it optional.
      translations: [
        {
          languageCode: LanguageCode.hu,
          name: definition.label,
          slug: definition.id,
          description: "",
        },
      ],
    });

    return Number(product.id);
  }

  /**
   * Regenerates the native option groups/options/variants from the structured
   * model: creates missing groups+options, creates missing variants in
   * batches, refreshes prices, and soft-deletes variants, options and groups
   * that no longer exist in the model.
   */
  private async sync(
    ctx: RequestContext,
    nativeProductId: number,
    definition: CanonicalProductDefinition
  ): Promise<void> {
    const plan = planVariantCombinations(definition, await this.materialLabels(ctx));
    const optionIdsByGroupCode = await this.syncOptionGroups(ctx, nativeProductId, plan);

    await this.syncVariants(ctx, nativeProductId, plan, optionIdsByGroupCode);

    // The native product's own name/slug are sync-owned too: restoring them
    // here is what makes a forced re-sync converge with the stored hash.
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: { translations: true },
    });

    if (product === null) {
      throw new Error(`A szinkronizált natív termék eltűnt: ${nativeProductId}`);
    }

    const name = huName(product.translations);
    const slug = product.translations.find(
      (translation) => translation.languageCode === LanguageCode.hu
    )?.slug;

    if (name !== definition.label || slug !== definition.id) {
      await this.productService.update(ctx, {
        id: nativeProductId,
        translations: [
          {
            languageCode: LanguageCode.hu,
            name: definition.label,
            slug: definition.id,
          },
        ],
      });
    }
  }

  /**
   * Creates missing option groups and options, updates renamed ones, deletes
   * removed ones, and returns the resolved native option id per group/option
   * code for the variant writes.
   */
  private async syncOptionGroups(
    ctx: RequestContext,
    nativeProductId: number,
    plan: VariantPlan
  ): Promise<Map<string, Map<string, number>>> {
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: { optionGroups: { translations: true, options: { translations: true } } },
    });

    if (product === null) {
      throw new Error(`A szinkronizált natív termék eltűnt: ${nativeProductId}`);
    }

    const plannedByCode = new Map(plan.optionGroups.map((group) => [group.code, group]));
    const optionIdsByGroupCode = new Map<string, Map<string, number>>();

    for (const group of product.optionGroups) {
      const planned = plannedByCode.get(group.code);
      optionIdsByGroupCode.set(group.code, new Map());

      if (planned === undefined) {
        await this.productService.removeOptionGroupFromProduct(
          ctx,
          nativeProductId,
          group.id,
          true
        );
        await this.optionGroupService.delete(ctx, group.id, true);
        continue;
      }

      if (huName(group.translations) !== planned.name) {
        await this.optionGroupService.update(ctx, {
          id: group.id,
          translations: [{ languageCode: LanguageCode.hu, name: planned.name }],
        });
      }

      const plannedOptions = new Map(planned.options.map((option) => [option.code, option]));
      const optionIds = optionIdsByGroupCode.get(group.code);

      if (optionIds === undefined) {
        throw new Error(`Az opciócsoport azonosítói nem elérhetők: ${group.code}`);
      }

      for (const option of group.options) {
        const plannedOption = plannedOptions.get(option.code);

        if (plannedOption === undefined) {
          await this.optionService.delete(ctx, option.id);
          continue;
        }

        plannedOptions.delete(option.code);
        optionIds.set(option.code, Number(option.id));

        if (huName(option.translations) !== plannedOption.name) {
          await this.optionService.update(ctx, {
            id: option.id,
            translations: [{ languageCode: LanguageCode.hu, name: plannedOption.name }],
          });
        }
      }

      for (const [code, plannedOption] of plannedOptions) {
        const created = await this.optionService.create(ctx, group.id, {
          code,
          translations: [{ languageCode: LanguageCode.hu, name: plannedOption.name }],
        });

        optionIds.set(code, Number(created.id));
      }
    }

    for (const planned of plan.optionGroups) {
      if (optionIdsByGroupCode.has(planned.code)) {
        continue;
      }

      const createdGroup = await this.optionGroupService.create(ctx, {
        code: planned.code,
        translations: [{ languageCode: LanguageCode.hu, name: planned.name }],
      });

      await this.productService.addOptionGroupToProduct(ctx, nativeProductId, createdGroup.id);

      const optionIds = new Map<string, number>();
      optionIdsByGroupCode.set(planned.code, optionIds);

      for (const plannedOption of planned.options) {
        const created = await this.optionService.create(ctx, createdGroup.id, {
          code: plannedOption.code,
          translations: [{ languageCode: LanguageCode.hu, name: plannedOption.name }],
        });

        optionIds.set(plannedOption.code, Number(created.id));
      }
    }

    return optionIdsByGroupCode;
  }

  /**
   * Batched variant writes: missing variants are created in chunks, changed
   * prices updated in chunks, and variants the model no longer knows are
   * soft-deleted (their sku can be re-created later — Vendure enforces no
   * sku uniqueness).
   */
  private async syncVariants(
    ctx: RequestContext,
    nativeProductId: number,
    plan: VariantPlan,
    optionIdsByGroupCode: ReadonlyMap<string, ReadonlyMap<string, number>>
  ): Promise<void> {
    const missingOption = plan.variants
      .flatMap((variant) =>
        variant.optionCodes.map((code, groupIndex) => ({
          group: plan.optionGroups[groupIndex]?.code ?? "",
          code,
        }))
      )
      .find((entry) => optionIdsByGroupCode.get(entry.group)?.has(entry.code) !== true);

    if (missingOption !== undefined) {
      throw new Error(
        `Nem sikerült a natív opció előállítása: ${missingOption.group}/${missingOption.code}`
      );
    }

    const existing = await this.connection.getRepository(ctx, ProductVariant).find({
      where: { product: { id: nativeProductId }, deletedAt: IsNull() },
      relations: { options: true, productVariantPrices: true },
    });
    const plannedBySku = new Map(plan.variants.map((variant) => [variant.sku, variant]));
    const existingBySku = new Map(existing.map((variant) => [variant.sku, variant]));
    const channelPrice = (variant: ProductVariant): number =>
      variant.productVariantPrices.find((price) => price.channelId === ctx.channelId)?.price ?? 0;

    const missing = plan.variants.filter((variant) => !existingBySku.has(variant.sku));

    for (let start = 0; start < missing.length; start += BATCH_SIZE) {
      await this.variantService.create(
        ctx,
        missing.slice(start, start + BATCH_SIZE).map((variant) => ({
          productId: nativeProductId,
          sku: variant.sku,
          price: variant.price,
          optionIds: variant.optionCodes.map((code, groupIndex) => {
            const optionId = optionIdsByGroupCode
              .get(plan.optionGroups[groupIndex]?.code ?? "")
              ?.get(code);

            if (optionId === undefined) {
              throw new Error(`Nem sikerült a natív opció előállítása: ${code}`);
            }

            return optionId;
          }),
          translations: [{ languageCode: LanguageCode.hu, name: variant.name }],
        }))
      );
    }

    const priceUpdates = existing
      .map((variant) => ({ variant, planned: plannedBySku.get(variant.sku) }))
      .filter(
        (pair) => pair.planned !== undefined && channelPrice(pair.variant) !== pair.planned.price
      )
      .map((pair) => ({ id: pair.variant.id, price: pair.planned?.price ?? 0 }));

    for (let start = 0; start < priceUpdates.length; start += BATCH_SIZE) {
      await this.variantService.update(ctx, priceUpdates.slice(start, start + BATCH_SIZE));
    }

    const stale = existing.filter((variant) => !plannedBySku.has(variant.sku));

    if (stale.length > 0) {
      await this.variantService.softDelete(
        ctx,
        stale.map((variant) => variant.id)
      );
    }
  }

  /** The native state as it exists right now, for drift hashing. */
  private async currentNativeState(
    ctx: RequestContext,
    nativeProductId: number
  ): Promise<NativeProductState> {
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: {
        translations: true,
        optionGroups: { translations: true, options: { translations: true } },
      },
    });

    if (product === null) {
      throw new Error(`A natív termék eltűnt: ${nativeProductId}`);
    }

    const huTranslation = product.translations.find(
      (translation) => translation.languageCode === LanguageCode.hu
    );
    const variants = await this.connection.getRepository(ctx, ProductVariant).find({
      where: { product: { id: nativeProductId }, deletedAt: IsNull() },
      relations: { options: { group: true }, translations: true, productVariantPrices: true },
    });

    return {
      slug: huTranslation?.slug ?? "",
      name: huName(product.translations) ?? "",
      optionGroups: product.optionGroups.map((group) => ({
        code: group.code,
        name: huName(group.translations) ?? group.code,
        options: group.options.map((option) => ({
          code: option.code,
          name: huName(option.translations) ?? option.code,
        })),
      })),
      variants: variants.map((variant) => ({
        sku: variant.sku,
        name: huName(variant.translations) ?? variant.sku,
        price:
          variant.productVariantPrices.find((price) => price.channelId === ctx.channelId)?.price ??
          0,
        options: variant.options.map((option) => ({
          groupCode: option.group.code,
          optionCode: option.code,
        })),
      })),
    };
  }

  /** Records the post-sync hashes that power drift detection. */
  private async recordSyncState(
    ctx: RequestContext,
    productId: string,
    nativeProductId: number,
    definition: CanonicalProductDefinition
  ): Promise<void> {
    const state = await this.currentNativeState(ctx, nativeProductId);

    await this.connection.getRepository(ctx, ProductDefinition).update(
      { productId },
      {
        syncedDefinitionHash: definitionHash(definition),
        syncedNativeStateHash: nativeStateHash(state),
      }
    );
  }

  private async materialLabels(ctx: RequestContext): Promise<Map<string, string>> {
    const materials = await this.connection.getRepository(ctx, Material).find();

    return new Map(materials.map((material) => [material.slug, material.label]));
  }

  private async validated(
    input: unknown,
    ctx: RequestContext
  ): Promise<CanonicalProductDefinition> {
    const materials = await this.connection.getRepository(ctx, Material).find();
    const result = validateProductDefinition(
      input,
      new Set(materials.map((material) => material.slug))
    );

    if (!result.success) {
      throw new UserInputError(result.errors.join("\n"));
    }

    return result.definition;
  }
}
