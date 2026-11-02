import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import {
  ChannelService,
  DefaultSlugStrategy,
  FacetValue,
  I18nError,
  LanguageCode,
  LogLevel,
  Product,
  ProductOptionGroupService,
  ProductOptionService,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import type { JobQueue } from "@vendure/core";
import type { UpdateProductVariantInput } from "@vendure/common/lib/generated-types";
import { JobQueueService } from "@vendure/core";
import { In, IsNull } from "typeorm";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
// The node-only entry: productRevision needs node:crypto, which must not reach
// the dashboard's browser bundle through the main barrel.
import { productRevision } from "@babasarok/product-definition/node";
import { Material } from "../material/material.entity";
import { sortDefinitions } from "./definition-sort";
import {
  COLOR_FACET_CODE,
  MATERIAL_FACET_CODE,
  plannedVariantFacetCodes,
  type MaterialFacetData,
} from "./facet-plan";
import { validateProductDefinition } from "./product-definition";
import { ProductDefinition } from "./product.entity";
import { nativeStateHash, type NativeProductState } from "./sync-state";
import { plannedNativeState, planVariantCombinations, type VariantPlan } from "./variant-plan";

function huTranslation<T extends { languageCode: LanguageCode }>(
  translations: readonly T[] | undefined
): T | undefined {
  return translations?.find((translation) => translation.languageCode === LanguageCode.hu);
}

function huName(
  translations: Array<{ languageCode: LanguageCode; name: string }> | undefined
): string | undefined {
  return huTranslation(translations)?.name;
}

/** The variant writes per ProductVariantService call — the spike's per-variant loop is not shippable. */
const BATCH_SIZE = 100;

/** Drift refusal with a machine-readable code: the dashboard keys its
 * force-confirmation UX off `extensions.code`, not the message text. */
class NativeDriftError extends I18nError {
  constructor(message: string) {
    super(message, {}, "PRODUCT_DEFINITION_NATIVE_DRIFT", LogLevel.Warn);
  }
}

/** The job queue processes jobs strictly sequentially (Vendure's default concurrency 1),
 * so a re-save while a sync is running simply queues a second pass. */
const SYNC_QUEUE_NAME = "product-definition-sync";

@Injectable()
export class ProductDefinitionService implements OnApplicationBootstrap {
  private syncQueue: JobQueue<{ productId: string }> | null = null;
  private readonly slugStrategy = new DefaultSlugStrategy();

  constructor(
    private connection: TransactionalConnection,
    private productService: ProductService,
    private optionGroupService: ProductOptionGroupService,
    private optionService: ProductOptionService,
    private variantService: ProductVariantService,
    private jobQueueService: JobQueueService,
    private requestContextService: RequestContextService,
    private channelService: ChannelService
  ) {}

  /** The server process only enqueues; the worker process runs the syncs. */
  async onApplicationBootstrap(): Promise<void> {
    this.syncQueue = await this.jobQueueService.createQueue({
      name: SYNC_QUEUE_NAME,
      process: async (job) => {
        await this.processSyncJob(job.data.productId);
      },
    });
  }

  async productDefinitions(
    ctx: RequestContext,
    options: {
      skip?: number | null;
      take?: number | null;
      sort?: unknown;
      // ponytail: the table contract always sends filter, but no filter UI is configured for this table — ignored
      filter?: unknown;
    } | null
  ): Promise<{ items: ProductDefinition[]; totalItems: number }> {
    const rows = await this.connection
      .getRepository(ctx, ProductDefinition)
      .find({ order: { productId: "ASC" } });
    const sorted = sortDefinitions(rows, options?.sort);
    const skip = Math.max(options?.skip ?? 0, 0);
    const take = Math.min(Math.max(options?.take ?? 20, 1), 100);

    return { items: sorted.slice(skip, skip + take), totalItems: rows.length };
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

    const row = await this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      const nativeProductId = await this.createNativeProduct(txCtx, definition);
      await txRepo.insert({
        productId: definition.id,
        definition,
        nativeProductId,
        syncState: "pending",
      });

      return txRepo.findOneByOrFail({ productId: definition.id });
    });

    await this.enqueueSync(ctx, row.productId);
    return row;
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

    // While a sync is pending the recorded hashes do not describe the native
    // product, so drift detection only guards settled states.
    if (existing.nativeProductId !== null && existing.syncState !== "pending") {
      await this.assertNoNativeDrift(ctx, existing.nativeProductId, existing, force === true);
    }

    const row = await this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      await txRepo.update({ productId }, { definition, syncState: "pending", syncError: null });

      if (existing.nativeProductId === null) {
        const nativeProductId = await this.createNativeProduct(txCtx, definition);
        await txRepo.update({ productId }, { nativeProductId });
      }

      return txRepo.findOneByOrFail({ productId });
    });

    await this.enqueueSync(ctx, row.productId);
    return row;
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

  async productDefinitionByNativeProduct(
    ctx: RequestContext,
    nativeProductId: number
  ): Promise<ProductDefinition | null> {
    return this.connection.getRepository(ctx, ProductDefinition).findOneBy({ nativeProductId });
  }

  /** The native variants a sync generates, paged for the dashboard's variant table. */
  async generatedVariantList(
    ctx: RequestContext,
    row: ProductDefinition,
    options: { skip?: number | null; take?: number | null } | null
  ): Promise<{
    items: Array<{ id: string; name: string; code: string; price: number; facets: string }>;
    totalItems: number;
  }> {
    const skip = Math.max(options?.skip ?? 0, 0);
    const take = Math.min(Math.max(options?.take ?? 20, 1), 100);

    if (row.nativeProductId === null) {
      return { items: [], totalItems: 0 };
    }

    const [variants, totalItems] = await this.connection
      .getRepository(ctx, ProductVariant)
      .findAndCount({
        where: { product: { id: row.nativeProductId }, deletedAt: IsNull() },
        relations: { translations: true, productVariantPrices: true, facetValues: true },
        order: { id: "ASC" },
        skip,
        take,
      });

    return {
      totalItems,
      items: variants.map((variant) => ({
        id: String(variant.id),
        name: huName(variant.translations) ?? variant.sku,
        code: variant.sku,
        price:
          variant.productVariantPrices.find((price) => price.channelId === ctx.channelId)?.price ??
          0,
        facets: [
          ...new Set(variant.facetValues.map((value) => huName(value.translations) ?? value.code)),
        ].join(", "),
      })),
    };
  }

  /**
   * Whether a sync would change the native product right now: the definition,
   * the referenced materials or the native product itself moved since the last
   * sync. Pure planned-vs-actual comparison, so it needs no stored hashes.
   */
  async staleness(ctx: RequestContext, rows: ProductDefinition[]): Promise<Map<string, boolean>> {
    const materialData = await this.materialData(ctx);
    const flags = new Map<string, boolean>();

    for (const row of rows) {
      if (row.nativeProductId === null) {
        flags.set(row.productId, false);
        continue;
      }

      const planned = plannedNativeState(row.definition, materialData, (id) =>
        this.slugStrategy.generate(ctx, { value: id })
      );
      const current = await this.currentNativeState(ctx, row.nativeProductId);

      flags.set(row.productId, nativeStateHash(planned) !== nativeStateHash(current));
    }

    return flags;
  }

  /** Queues a sync after the definition write committed. */
  private async enqueueSync(ctx: RequestContext, productId: string): Promise<void> {
    if (this.syncQueue === null) {
      throw new Error("A termékszinkronizáló sor még nem áll rendelkezésre.");
    }

    try {
      await this.syncQueue.add({ productId });
    } catch (error: unknown) {
      await this.connection
        .getRepository(ctx, ProductDefinition)
        .update({ productId }, { syncState: "failed", syncError: String(error) });

      throw error;
    }
  }

  /** The worker-side sync of a definition's current stored state. */
  private async processSyncJob(productId: string): Promise<void> {
    const ctx = await this.jobContext();
    const repo = this.connection.getRepository(ctx, ProductDefinition);
    const row = await repo.findOneBy({ productId });

    // The definition write may have been rolled back after the job was queued.
    if (row === null) {
      return;
    }

    try {
      await this.connection.withTransaction(ctx, async (txCtx) => {
        let nativeProductId = row.nativeProductId;

        if (nativeProductId === null) {
          nativeProductId = await this.createNativeProduct(txCtx, row.definition);
          await this.connection
            .getRepository(txCtx, ProductDefinition)
            .update({ productId }, { nativeProductId });
        }

        await this.sync(txCtx, nativeProductId, row.definition);

        const state = await this.currentNativeState(txCtx, nativeProductId);
        await this.connection.getRepository(txCtx, ProductDefinition).update(
          { productId },
          {
            syncedDefinitionHash: productRevision(row.definition),
            syncedNativeStateHash: nativeStateHash(state),
            syncState: "synced",
            syncError: null,
          }
        );
      });
    } catch (error: unknown) {
      await repo.update(
        { productId },
        {
          syncState: "failed",
          syncError: error instanceof Error ? error.message : String(error),
        }
      );

      throw error;
    }
  }

  /** Job handlers run outside any request; the sync needs the default channel. */
  private async jobContext(): Promise<RequestContext> {
    const defaultChannel = await this.channelService.getDefaultChannel();

    return this.requestContextService.create({ apiType: "admin", channelOrToken: defaultChannel });
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
      throw new NativeDriftError(
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
    const materialData = await this.materialData(ctx);
    const plan = planVariantCombinations(definition, materialData);
    const facetCodesBySku = plannedVariantFacetCodes(plan, materialData);
    const optionIdsByGroupCode = await this.syncOptionGroups(ctx, nativeProductId, plan);
    const facetValueIdsByCode = await this.facetValueIdsByCode(ctx, facetCodesBySku);

    await this.syncVariants(
      ctx,
      nativeProductId,
      plan,
      optionIdsByGroupCode,
      facetCodesBySku,
      facetValueIdsByCode
    );

    // The native product's own name/slug are sync-owned too: restoring them
    // here is what makes a forced re-sync converge with the stored hash.
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: { translations: true },
    });

    if (product === null) {
      throw new Error(`A szinkronizált natív termék eltűnt: ${nativeProductId}`);
    }

    const translation = huTranslation(product.translations);
    const name = translation?.name;
    const slug = translation?.slug;

    // Vendure normalizes slugs (DefaultSlugStrategy), so the comparison and
    // the written value use the normalized form — ids like "Eu borito" can
    // never be stored verbatim.
    const expectedSlug = this.slugStrategy.generate(ctx, { value: definition.id });

    if (name !== definition.label || slug !== expectedSlug) {
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
   * Batched variant writes: missing variants are created in chunks, drifted
   * existing variants (price, name, option assignment) updated in chunks, and
   * variants the model no longer knows are soft-deleted (their sku can be
   * re-created later — Vendure enforces no sku uniqueness).
   */
  private async syncVariants(
    ctx: RequestContext,
    nativeProductId: number,
    plan: VariantPlan,
    optionIdsByGroupCode: ReadonlyMap<string, ReadonlyMap<string, number>>,
    facetCodesBySku: ReadonlyMap<string, string[]>,
    facetValueIdsByCode: ReadonlyMap<string, number>
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

    const optionIdsFor = (variant: { optionCodes: string[] }): number[] =>
      variant.optionCodes.map((code, groupIndex) => {
        const optionId = optionIdsByGroupCode
          .get(plan.optionGroups[groupIndex]?.code ?? "")
          ?.get(code);

        if (optionId === undefined) {
          throw new Error(`Nem sikerült a natív opció előállítása: ${code}`);
        }

        return optionId;
      });

    const facetValueIdsFor = (sku: string): number[] => {
      const ids: number[] = [];

      for (const code of facetCodesBySku.get(sku) ?? []) {
        const id = facetValueIdsByCode.get(code);

        if (id === undefined) {
          throw new Error(`Nem sikerült a facet érték feloldása: ${code}`);
        }

        ids.push(id);
      }

      return ids;
    };

    const existing = await this.connection.getRepository(ctx, ProductVariant).find({
      where: { product: { id: nativeProductId }, deletedAt: IsNull() },
      relations: {
        options: true,
        translations: true,
        productVariantPrices: true,
        facetValues: true,
      },
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
          optionIds: optionIdsFor(variant),
          facetValueIds: facetValueIdsFor(variant.sku),
          translations: [{ languageCode: LanguageCode.hu, name: variant.name }],
        }))
      );
    }

    const updates: UpdateProductVariantInput[] = [];

    for (const variant of existing) {
      const planned = plannedBySku.get(variant.sku);

      if (planned === undefined) {
        continue;
      }

      const plannedOptionIds = optionIdsFor(planned);
      const actualOptionIds = new Set(variant.options.map((option) => Number(option.id)));
      const optionsChanged =
        actualOptionIds.size !== plannedOptionIds.length ||
        plannedOptionIds.some((optionId) => !actualOptionIds.has(optionId));
      const plannedFacetIds = facetValueIdsFor(variant.sku);
      const actualFacetIds = new Set(variant.facetValues.map((value) => Number(value.id)));
      const facetsChanged =
        actualFacetIds.size !== plannedFacetIds.length ||
        plannedFacetIds.some((facetValueId) => !actualFacetIds.has(facetValueId));
      const priceChanged = channelPrice(variant) !== planned.price;
      const nameChanged = huName(variant.translations) !== planned.name;

      if (!optionsChanged && !priceChanged && !nameChanged && !facetsChanged) {
        continue;
      }

      const update: UpdateProductVariantInput = { id: variant.id };

      if (priceChanged) {
        update.price = planned.price;
      }

      if (nameChanged) {
        update.translations = [{ languageCode: LanguageCode.hu, name: planned.name }];
      }

      if (optionsChanged) {
        update.optionIds = plannedOptionIds;
      }

      if (facetsChanged) {
        update.facetValueIds = plannedFacetIds;
      }

      updates.push(update);
    }

    for (let start = 0; start < updates.length; start += BATCH_SIZE) {
      await this.variantService.update(ctx, updates.slice(start, start + BATCH_SIZE));
    }

    const stale = existing.filter((variant) => !plannedBySku.has(variant.sku));

    if (stale.length > 0) {
      await this.variantService.softDelete(
        ctx,
        stale.map((variant) => variant.id)
      );
    }
  }

  /**
   * Resolves the native facet value ids the sync needs, up front: a missing
   * or duplicated code is a broken facet state, not something to paper over.
   */
  private async facetValueIdsByCode(
    ctx: RequestContext,
    facetCodesBySku: ReadonlyMap<string, string[]>
  ): Promise<Map<string, number>> {
    const codes = [...new Set([...facetCodesBySku.values()].flat())];

    if (codes.length === 0) {
      return new Map();
    }

    const values = await this.connection.getRepository(ctx, FacetValue).find({
      where: { code: In(codes) },
      relations: { facet: true },
    });
    const syncFacetCodes = new Set([MATERIAL_FACET_CODE, COLOR_FACET_CODE]);
    const byCode = new Map<string, FacetValue>();

    for (const value of values) {
      if (byCode.has(value.code)) {
        throw new Error(`Több facet érték ugyanazzal a kóddal: ${value.code}`);
      }

      if (!syncFacetCodes.has(value.facet.code)) {
        throw new Error(
          `A(z) "${value.code}" facet érték nem a szinkronizált facetekhez tartozik: ${value.facet.code}`
        );
      }

      byCode.set(value.code, value);
    }

    const missing = codes.filter((code) => !byCode.has(code));

    if (missing.length > 0) {
      throw new Error(
        `Hiányzó facet érték: ${missing.join(", ")}. Futtasd a facet-egyeztetést ` +
          "(convergeMaterialFacets vagy pnpm -C backend run converge-facets)."
      );
    }

    return new Map([...byCode].map(([code, value]) => [code, Number(value.id)]));
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
      relations: {
        options: { group: true },
        translations: true,
        productVariantPrices: true,
        facetValues: true,
      },
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
        facetValues: variant.facetValues.map((value) => value.code),
      })),
    };
  }

  /** The materials' labels and colors, the two inputs the facet/variant plan reads. */
  private async materialData(ctx: RequestContext): Promise<Map<string, MaterialFacetData>> {
    const materials = await this.connection.getRepository(ctx, Material).find();

    return new Map(
      materials.map((material) => [
        material.slug,
        {
          label: material.label,
          colors: material.colors.map((color) => ({ id: color.colorId, label: color.label })),
        },
      ])
    );
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

    // The revision is the server's determination: the caller's value (if any)
    // is replaced with the canonical hash over the commerce-relevant facts.
    const { revision: _clientRevision, ...facts } = result.definition;

    return { ...facts, revision: productRevision(result.definition) };
  }
}
