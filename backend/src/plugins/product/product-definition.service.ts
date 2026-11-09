import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import {
  ChannelService,
  DefaultSlugStrategy,
  EventBus,
  FacetValue,
  I18nError,
  LanguageCode,
  Logger,
  LogLevel,
  Product,
  ProductEvent,
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
import type { InspectableJobQueueStrategy, Job, JobQueue } from "@vendure/core";
import type { ID } from "@vendure/common/lib/shared-types";
import type {
  JobFilterParameter,
  UpdateProductVariantInput,
} from "@vendure/common/lib/generated-types";
import { DeletionResult, GlobalFlag } from "@vendure/common/lib/generated-types";
import {
  ConfigService,
  isInspectableJobQueueStrategy,
  JobQueueService,
  PollingJobQueueStrategy,
  ProcessContext,
} from "@vendure/core";
import { In, IsNull } from "typeorm";
import type {
  LocalizedText,
  ProductDefinition as CanonicalProductDefinition,
} from "../../shared/product-definition/index";
import { canonicalJson, LabelSchema } from "../../shared/product-definition/index";
// The node-only entry: productRevision needs node:crypto, which must not reach
// the dashboard's browser bundle through the main barrel.
import { productRevision } from "../../shared/product-definition/node";
import { materialReferenceSlugs, toLanguageCode } from "../material/material.service";
import { MaterialEvent } from "../material/material.event";
import { Material } from "../material/material.entity";
import { lockMaterials } from "../material/material-lock";
import { sortDefinitions } from "./definition-sort";
import { deletedNativeProductId, updatedNativeProductId } from "./product-event";
import {
  type AutomaticSyncDecision,
  automaticSyncDecision,
  SyncJobDataSchema,
  updateInputCarriesName,
  type SyncJobData,
} from "./sync-decision";
import {
  COLOR_FACET_CODE,
  MATERIAL_FACET_CODE,
  plannedVariantFacetCodes,
  type MaterialFacetData,
} from "./facet-plan";
import { validateProductDefinition } from "./product-definition";
import { ProductDefinition } from "./product.entity";
import { memoPerRequest } from "./request-memo";
import {
  nativeStateHash,
  nativeStateDiff,
  type NativeProductState,
  type NativeStateDiff,
} from "./sync-state";
import { definitionsToRequeue } from "./sync-recovery";
import {
  createProgressCounter,
  progressOfJobData,
  progressPercent,
  type SyncProgress,
} from "./sync-progress";
import { huName, nativeProductTexts, textOf } from "./native-names";
import {
  plannedNativeState,
  planVariantCombinations,
  variantNamesUseProductName,
  type VariantPlan,
} from "./variant-plan";
import { BulkVariantWriter } from "./bulk-variant-writer";
import type { PlannedVariantCreate } from "./bulk-variant-writer";

function labelAsName(translation: { languageCode: LanguageCode; label: string }): {
  languageCode: LanguageCode;
  name: string;
} {
  return { languageCode: translation.languageCode, name: translation.label };
}

function nameTranslations(
  text: LocalizedText
): Array<{ languageCode: LanguageCode; name: string }> {
  return Object.entries(text).map(([language, name]) => ({
    languageCode: toLanguageCode(language),
    name,
  }));
}

function sameText(a: LocalizedText, b: LocalizedText): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** The variant writes per ProductVariantService call — the spike's per-variant loop is not shippable. */
const BATCH_SIZE = 100;

/**
 * Full-matrix variant loads fetch each to-many relation in its own query: one
 * joined query returns options × translations × prices × facet values rows per
 * variant (~290 for babafeszek, 334k rows for its 1 152 variants, doubling with
 * every added language), which OOM'd the worker on 2026-11-08/09.
 */
const VARIANT_RELATION_LOAD = "query";

/** Options and groups the plan no longer has. Their deletion waits for the
 * variant writes, because Vendure's option delete reports NOT_DELETED while
 * active variants still use the option instead of failing. */
interface OptionGroupRemovals {
  options: Array<{ id: ID; code: string }>;
  groups: Array<{ id: ID; code: string }>;
}

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

/** Every job matching `filter`, paged within Vendure's list-query limit. */
async function allJobs(
  strategy: InspectableJobQueueStrategy,
  filter: JobFilterParameter
): Promise<Job[]> {
  const jobs: Job[] = [];

  for (;;) {
    const page = await strategy.findMany({ filter, skip: jobs.length, take: BATCH_SIZE });
    jobs.push(...page.items);

    if (page.items.length < BATCH_SIZE) {
      return jobs;
    }
  }
}

@Injectable()
export class ProductDefinitionService implements OnApplicationBootstrap {
  private syncQueue: JobQueue<SyncJobData> | null = null;
  private readonly slugStrategy = new DefaultSlugStrategy();

  constructor(
    private connection: TransactionalConnection,
    private productService: ProductService,
    private optionGroupService: ProductOptionGroupService,
    private optionService: ProductOptionService,
    private variantService: ProductVariantService,
    private jobQueueService: JobQueueService,
    private configService: ConfigService,
    private requestContextService: RequestContextService,
    private channelService: ChannelService,
    private eventBus: EventBus,
    private processContext: ProcessContext,
    private bulkVariantWriter: BulkVariantWriter
  ) {}

  /** The server process only enqueues; the worker process runs the syncs. */
  async onApplicationBootstrap(): Promise<void> {
    this.syncQueue = await this.jobQueueService.createQueue({
      name: SYNC_QUEUE_NAME,
      process: async (job) => {
        const data = SyncJobDataSchema.parse(job.data);

        await this.processSyncJob(data, (progress) => {
          // Persisted by the job queue on its own connection, outside the sync transaction.
          Object.assign(job.data, { progress });
          job.setProgress(progressPercent(progress));
        });
      },
    });

    this.eventBus.ofType(MaterialEvent).subscribe((event) => {
      void this.onMaterialEvent(event);
    });

    this.eventBus.ofType(ProductEvent).subscribe((event) => {
      void this.onProductEvent(event);
    });

    if (this.processContext.isWorker) {
      try {
        await this.recoverInterruptedSyncs();
      } catch (error: unknown) {
        Logger.error(
          `A megszakadt szinkronizálások helyreállítása nem sikerült: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Heals syncs a crashed or killed worker left behind: its RUNNING jobs are
   * failed and every pending definition without a queued job is re-queued.
   * The interrupted transaction rolled back, so a fresh run restarts from zero.
   * Re-queued as "automatic": it never overwrites native drift, and an
   * interrupted owner save already passed its save-time drift check.
   */
  private async recoverInterruptedSyncs(): Promise<void> {
    const strategy = this.configService.jobQueueOptions.jobQueueStrategy;

    if (
      !(strategy instanceof PollingJobQueueStrategy) ||
      !isInspectableJobQueueStrategy(strategy) ||
      this.syncQueue === null
    ) {
      return;
    }

    // ponytail: assumes a single worker, so every RUNNING job is orphaned; overlapping workers would need a heartbeat to tell live syncs from dead ones
    const running = await allJobs(strategy, {
      queueName: { eq: SYNC_QUEUE_NAME },
      state: { eq: "RUNNING" },
    });

    for (const job of running) {
      job.fail(new Error("Worker stopped while the sync was running."));
      await strategy.update(job);
    }

    const queued = await allJobs(strategy, {
      queueName: { eq: SYNC_QUEUE_NAME },
      state: { in: ["PENDING", "RETRYING"] },
    });
    const pending = await this.connection.rawConnection
      .getRepository(ProductDefinition)
      .find({ where: { syncState: "pending" }, select: { productId: true } });

    const productIds = definitionsToRequeue(
      pending.map((row) => row.productId),
      queued.map((job): unknown => job.data)
    );

    for (const productId of productIds) {
      await this.syncQueue.add({ productId, origin: "automatic" });
    }
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
    await this.withNativeLabels(ctx, rows);
    const sorted = sortDefinitions(rows, options?.sort);
    const skip = Math.max(options?.skip ?? 0, 0);
    const take = Math.min(Math.max(options?.take ?? 20, 1), 100);

    return { items: sorted.slice(skip, skip + take), totalItems: rows.length };
  }

  async productDefinition(
    ctx: RequestContext,
    productId: string
  ): Promise<ProductDefinition | null> {
    const row = await this.connection
      .getRepository(ctx, ProductDefinition)
      .findOneBy({ productId });

    if (row === null) {
      return null;
    }

    await this.withNativeLabels(ctx, [row]);

    return row;
  }

  /** The latest progress a running sync job of this definition reported. */
  async syncProgress(productId: string): Promise<SyncProgress | null> {
    const strategy = this.configService.jobQueueOptions.jobQueueStrategy;

    if (!isInspectableJobQueueStrategy(strategy)) {
      return null;
    }

    const { items } = await strategy.findMany({
      filter: { queueName: { eq: SYNC_QUEUE_NAME }, state: { eq: "RUNNING" } },
    });
    const job = items.find(
      (candidate) => SyncJobDataSchema.parse(candidate.data).productId === productId
    );

    if (job === undefined) {
      return null;
    }

    return progressOfJobData(job.data);
  }

  async createProductDefinition(
    ctx: RequestContext,
    input: unknown,
    name: string
  ): Promise<ProductDefinition> {
    const parsedName = LabelSchema.safeParse(name);

    if (!parsedName.success) {
      throw new UserInputError("A terméknév megadása kötelező.");
    }

    const preliminary = await this.validated(input, ctx);
    const repo = this.connection.getRepository(ctx, ProductDefinition);

    if ((await repo.findOneBy({ productId: preliminary.id })) !== null) {
      throw new UserInputError(`Már létezik termék ezzel az azonosítóval: ${preliminary.id}`);
    }

    const row = await this.connection.withTransaction(ctx, async (txCtx) => {
      const definition = await this.validatedUnderMaterialLocks(input, txCtx, preliminary);
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      const nativeProductId = await this.createNativeProduct(txCtx, definition.id, parsedName.data);
      await txRepo.insert({
        productId: definition.id,
        definition,
        nativeProductId,
        syncState: "pending",
      });

      return txRepo.findOneByOrFail({ productId: definition.id });
    });

    row.label = parsedName.data;
    await this.enqueueSync(ctx, row.productId, "owner-save");

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

    const preliminary = await this.validated(input, ctx);

    if (preliminary.id !== productId) {
      throw new UserInputError("A termékazonosító nem módosítható.");
    }

    // While a sync is pending the recorded hashes do not describe the native
    // product, so drift detection only guards settled states.
    if (existing.nativeProductId !== null && existing.syncState !== "pending") {
      await this.assertNoNativeDrift(ctx, existing.nativeProductId, existing, force === true);
    }

    const row = await this.connection.withTransaction(ctx, async (txCtx) => {
      const definition = await this.validatedUnderMaterialLocks(input, txCtx, preliminary);
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      await txRepo.update({ productId }, { definition, syncState: "pending", syncError: null });

      if (existing.nativeProductId === null) {
        // Recovery path for a definition that lost its native product: no
        // stored name exists, so the id seeds the name too — rename it on
        // the stock product form.
        const nativeProductId = await this.createNativeProduct(txCtx, definition.id, definition.id);
        await txRepo.update({ productId }, { nativeProductId });
      }

      return txRepo.findOneByOrFail({ productId });
    });

    await this.withNativeLabels(ctx, [row]);
    await this.enqueueSync(ctx, row.productId, "owner-save");

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
    const row = await this.connection
      .getRepository(ctx, ProductDefinition)
      .findOneBy({ nativeProductId });

    if (row === null) {
      return null;
    }

    await this.withNativeLabels(ctx, [row]);

    return row;
  }

  /** Every stored definition by native product id, loaded once per request
   * so a product list does not query per product. */
  definitionsByNativeProduct = memoPerRequest(
    async (ctx: RequestContext): Promise<ReadonlyMap<number, CanonicalProductDefinition>> => {
      const rows = await this.connection.getRepository(ctx, ProductDefinition).find({
        select: { nativeProductId: true, definition: true },
      });

      return new Map(
        rows.flatMap((row) =>
          row.nativeProductId === null ? [] : [[row.nativeProductId, row.definition] as const]
        )
      );
    }
  );

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
    const analysis = await this.driftAnalysis(ctx, rows);
    const flags = new Map<string, boolean>();

    for (const [productId, result] of analysis) {
      flags.set(productId, result.stale);
    }

    return flags;
  }

  /**
   * Staleness plus the drift-detail entries behind it (the drift-detail
   * display): what a sync would change on the native product right now.
   * Details are empty when the state is not stale.
   */
  async driftAnalysis(
    ctx: RequestContext,
    rows: ProductDefinition[]
  ): Promise<Map<string, { stale: boolean; details: NativeStateDiff[] }>> {
    const materialData = await this.materialData(ctx);
    const names = await this.nativeNames(ctx, rows);
    const analysis = new Map<string, { stale: boolean; details: NativeStateDiff[] }>();

    for (const row of rows) {
      if (row.nativeProductId === null) {
        analysis.set(row.productId, { stale: false, details: [] });
        continue;
      }

      const planned = plannedNativeState(
        row.definition,
        materialData,
        names.get(row.nativeProductId) ?? { hu: "" }
      );
      const current = await this.currentNativeState(ctx, row.nativeProductId);
      const stale = nativeStateHash(planned) !== nativeStateHash(current);

      analysis.set(row.productId, {
        stale,
        details: stale ? nativeStateDiff(planned, current) : [],
      });
    }

    return analysis;
  }

  /**
   * Re-syncs every definition referencing the material: renames, color
   * changes and facet upkeep propagate to the affected native products.
   */
  async enqueueSyncsForMaterial(ctx: RequestContext, materialSlug: string): Promise<number> {
    const rows = await this.connection.getRepository(ctx, ProductDefinition).find();
    const affected = rows.filter((row) => materialReferenceSlugs(row.definition).has(materialSlug));

    for (const row of affected) {
      await this.enqueueSync(ctx, row.productId, "automatic");
    }

    return affected.length;
  }

  private async onMaterialEvent(event: MaterialEvent): Promise<void> {
    try {
      await this.enqueueSyncsForMaterial(event.ctx, event.materialSlug);
    } catch (error: unknown) {
      Logger.error(
        `Az anyag-módosulás utáni termékszinkronizálás sikertelen (${event.materialSlug}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Stock product writes find their generated definition: a delete cascades
   * to it (ADR 0011 decision 4 — the configurator's own delete removes the
   * definition first, so this finds nothing to do there), and a rename
   * re-enqueues its sync only when a variant is named after the product
   * (ADR 0011 decision 1: the native Product owns the name; the sync only
   * reads it).
   */
  private async onProductEvent(event: ProductEvent): Promise<void> {
    const nativeProductId = deletedNativeProductId(event) ?? updatedNativeProductId(event);

    if (nativeProductId === undefined) {
      return;
    }

    if (event.type === "updated" && !updateInputCarriesName(event.input)) {
      return;
    }

    try {
      if (event.type === "deleted") {
        await this.connection.getRepository(event.ctx, ProductDefinition).delete({
          nativeProductId,
        });
        return;
      }

      const row = await this.connection
        .getRepository(event.ctx, ProductDefinition)
        .findOneBy({ nativeProductId });

      if (row !== null && variantNamesUseProductName(row.definition)) {
        await this.enqueueSync(event.ctx, row.productId, "automatic");
      }
    } catch (error: unknown) {
      Logger.error(
        `A natív termék eseménye utáni definíció-frissítés sikertelen (${nativeProductId}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Whether a not-yet-started sync job for the product sits in the queue.
   * Uninspectable strategies fail open: enqueue unconditionally, as before.
   */
  private async hasQueuedSync(productId: string): Promise<boolean> {
    const strategy = this.configService.jobQueueOptions.jobQueueStrategy;

    if (
      !(strategy instanceof PollingJobQueueStrategy) ||
      !isInspectableJobQueueStrategy(strategy)
    ) {
      return false;
    }

    const jobs = await allJobs(strategy, {
      queueName: { eq: SYNC_QUEUE_NAME },
      state: { in: ["PENDING", "RETRYING"] },
    });

    return jobs.some((job) => SyncJobDataSchema.parse(job.data).productId === productId);
  }

  /** Queues a sync after the definition write committed. */
  private async enqueueSync(
    ctx: RequestContext,
    productId: string,
    origin: SyncJobData["origin"]
  ): Promise<void> {
    if (this.syncQueue === null) {
      throw new Error("A termékszinkronizáló sor még nem áll rendelkezésre.");
    }

    // One queued job covers any number of later changes: the job re-reads the
    // definition and the materials when it runs. Without this, a material
    // write burst enqueues the same product once per referencing material and
    // the sequential worker chews through duplicate heavy syncs. A RUNNING job
    // must not swallow the follow-up (it read its state at start, so a save
    // that lands mid-run still queues its own pass) — hence not-started only.
    if (await this.hasQueuedSync(productId)) {
      return;
    }

    try {
      await this.syncQueue.add({ productId, origin });
    } catch (error: unknown) {
      await this.connection
        .getRepository(ctx, ProductDefinition)
        .update({ productId }, { syncState: "failed", syncError: String(error) });

      throw error;
    }
  }

  /** The worker-side sync of a definition's current stored state. */
  private async processSyncJob(
    { productId, origin }: SyncJobData,
    reportProgress: (progress: SyncProgress) => void
  ): Promise<void> {
    const ctx = await this.jobContext();
    const repo = this.connection.getRepository(ctx, ProductDefinition);
    const row = await repo.findOneBy({ productId });

    // The definition write may have been rolled back after the job was queued.
    if (row === null) {
      return;
    }

    try {
      if (origin === "automatic" && row.nativeProductId !== null) {
        const decision = await this.automaticDecision(ctx, row, row.nativeProductId);

        if (decision === "drift") {
          await repo.update(
            { productId },
            {
              syncState: "failed",
              syncError:
                `A(z) "${productId}" termék natív adatai (opciók, változatok, árak) a ` +
                "szinkronizáláson kívül módosultak, ezért az automatikus szinkronizálás nem írta felül őket. " +
                "A felülírásukhoz mentsd újra a terméket a konfigurátorban, és hagyd jóvá a szinkronizálást.",
            }
          );
          return;
        }

        if (decision === "skip") {
          await repo.update(
            { productId },
            {
              syncedDefinitionHash: productRevision(row.definition),
              syncedNativeStateHash: nativeStateHash(
                await this.currentNativeState(ctx, row.nativeProductId)
              ),
              syncState: "synced",
              syncError: null,
            }
          );
          return;
        }
      }

      await this.connection.withTransaction(ctx, async (txCtx) => {
        let nativeProductId = row.nativeProductId;

        if (nativeProductId === null) {
          // Recovery path for a definition that lost its native product: no
          // stored name exists, so the id seeds the name too — rename it on
          // the stock product form.
          nativeProductId = await this.createNativeProduct(
            txCtx,
            row.definition.id,
            row.definition.id
          );
          await this.connection
            .getRepository(txCtx, ProductDefinition)
            .update({ productId }, { nativeProductId });
        }

        await this.sync(txCtx, nativeProductId, row.definition, reportProgress);

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
      // The stored syncError carries only the message; the job queue's own
      // error line drops the stack, so the full trace is logged here.
      Logger.error(
        `A(z) "${productId}" termék szinkronizálása meghiúsult:\n` +
          (error instanceof Error ? (error.stack ?? error.message) : String(error)),
        undefined,
        SYNC_QUEUE_NAME
      );
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

  private async automaticDecision(
    ctx: RequestContext,
    row: ProductDefinition,
    nativeProductId: number
  ): Promise<AutomaticSyncDecision> {
    const materialData = await this.materialData(ctx);
    const names = await this.nativeNames(ctx, [row]);
    const planned = plannedNativeState(
      row.definition,
      materialData,
      names.get(nativeProductId) ?? { hu: "" }
    );
    const current = await this.currentNativeState(ctx, nativeProductId);

    return automaticSyncDecision({
      planned: nativeStateHash(planned),
      current: nativeStateHash(current),
      synced: row.syncedNativeStateHash,
    });
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

  /** Creates the native Vendure Product the definition generates. The slug is
   * seeded from the definition id at creation only (ADR 0011 decision 1) —
   * afterwards the stock form owns name and slug. */
  private async createNativeProduct(
    ctx: RequestContext,
    id: string,
    name: string
  ): Promise<number> {
    const product = await this.productService.create(ctx, {
      // description: "" — the column is NOT NULL and the admin UI always
      // sends the empty string; CreateProductInput leaves it optional.
      translations: [
        {
          languageCode: LanguageCode.hu,
          name,
          slug: this.slugStrategy.generate(ctx, { value: id }),
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
   * that no longer exist in the model. Removed options and groups are deleted
   * only after the variant writes: while stale variants still use an option,
   * Vendure reports NOT_DELETED on its deletion instead of failing.
   */
  private async sync(
    ctx: RequestContext,
    nativeProductId: number,
    definition: CanonicalProductDefinition,
    reportProgress: (progress: SyncProgress) => void
  ): Promise<void> {
    const materialData = await this.materialData(ctx);
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: { translations: true },
    });

    if (product === null) {
      throw new Error(`A szinkronizált natív termék eltűnt: ${nativeProductId}`);
    }

    // The variant names read the native product's hu name (ADR 0011
    // decision 1); the sync never writes the product's own name or slug.
    const productName = textOf(product.translations, "");

    if (huName(product.translations) === undefined) {
      throw new Error(`A natív terméknek nincs magyar nyelvű neve: ${nativeProductId}`);
    }

    const plan = planVariantCombinations(definition, materialData, productName);
    const facetCodesBySku = plannedVariantFacetCodes(plan, materialData);
    const { optionIdsByGroupCode, removals } = await this.syncOptionGroups(
      ctx,
      nativeProductId,
      plan
    );
    const facetValueIdsByCode = await this.facetValueIdsByCode(ctx, facetCodesBySku);

    await this.syncVariants(
      ctx,
      nativeProductId,
      plan,
      optionIdsByGroupCode,
      facetCodesBySku,
      facetValueIdsByCode,
      removals,
      reportProgress
    );
  }

  /**
   * Creates missing option groups and options, updates renamed ones, and
   * returns the resolved native option id per group/option code for the
   * variant writes plus the options and groups to delete. Soft-deleted rows
   * are ignored: the relation load returns them too (deletedAt is a plain
   * column), and deleting one again would fail the sync.
   */
  private async syncOptionGroups(
    ctx: RequestContext,
    nativeProductId: number,
    plan: VariantPlan
  ): Promise<{
    optionIdsByGroupCode: Map<string, Map<string, number>>;
    removals: OptionGroupRemovals;
  }> {
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: { optionGroups: { translations: true, options: { translations: true } } },
    });

    if (product === null) {
      throw new Error(`A szinkronizált natív termék eltűnt: ${nativeProductId}`);
    }

    const plannedByCode = new Map(plan.optionGroups.map((group) => [group.code, group]));
    const optionIdsByGroupCode = new Map<string, Map<string, number>>();
    const removals: OptionGroupRemovals = { options: [], groups: [] };

    for (const group of product.optionGroups) {
      if (group.deletedAt !== null) {
        continue;
      }

      const planned = plannedByCode.get(group.code);

      if (planned === undefined) {
        removals.groups.push({ id: group.id, code: group.code });
        continue;
      }

      optionIdsByGroupCode.set(group.code, new Map());

      if (!sameText(textOf(group.translations, group.code), planned.name)) {
        await this.optionGroupService.update(ctx, {
          id: group.id,
          translations: nameTranslations(planned.name),
        });
      }

      const plannedOptions = new Map(planned.options.map((option) => [option.code, option]));
      const optionIds = optionIdsByGroupCode.get(group.code);

      if (optionIds === undefined) {
        throw new Error(`Az opciócsoport azonosítói nem elérhetők: ${group.code}`);
      }

      for (const option of group.options) {
        if (option.deletedAt !== null) {
          continue;
        }

        const plannedOption = plannedOptions.get(option.code);

        if (plannedOption === undefined) {
          removals.options.push({ id: option.id, code: option.code });
          continue;
        }

        plannedOptions.delete(option.code);
        optionIds.set(option.code, Number(option.id));

        if (!sameText(textOf(option.translations, option.code), plannedOption.name)) {
          await this.optionService.update(ctx, {
            id: option.id,
            translations: nameTranslations(plannedOption.name),
          });
        }
      }

      for (const [code, plannedOption] of plannedOptions) {
        const created = await this.optionService.create(ctx, group.id, {
          code,
          translations: nameTranslations(plannedOption.name),
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
        translations: nameTranslations(planned.name),
      });

      await this.productService.addOptionGroupToProduct(ctx, nativeProductId, createdGroup.id);

      const optionIds = new Map<string, number>();
      optionIdsByGroupCode.set(planned.code, optionIds);

      for (const plannedOption of planned.options) {
        const created = await this.optionService.create(ctx, createdGroup.id, {
          code: plannedOption.code,
          translations: nameTranslations(plannedOption.name),
        });

        optionIds.set(plannedOption.code, Number(created.id));
      }
    }

    return { optionIdsByGroupCode, removals };
  }

  /**
   * Deletes the removed options and groups. Their option deletes report
   * NOT_DELETED while active variants still use them, so this runs after the
   * variant writes have soft-deleted the stale ones; the groups are detached
   * and deleted without force — a NOT_DELETED or in-use result fails the sync
   * instead of leaving the option exposed on the shop API.
   */
  private async deleteRemovedOptionGroups(
    ctx: RequestContext,
    nativeProductId: number,
    removals: OptionGroupRemovals
  ): Promise<void> {
    for (const option of removals.options) {
      const result = await this.optionService.delete(ctx, option.id);

      if (result.result !== DeletionResult.DELETED) {
        throw new Error(
          `A(z) "${option.code}" natív opció törlése nem sikerült, mert egy aktív változat még használja.`
        );
      }
    }

    for (const group of removals.groups) {
      const detached = await this.productService.removeOptionGroupFromProduct(
        ctx,
        nativeProductId,
        group.id
      );

      if ("productVariantCount" in detached) {
        throw new Error(
          `A(z) "${group.code}" natív opciócsoport eltávolítása nem sikerült, mert egy aktív változat még használja az egyik opcióját.`
        );
      }

      const result = await this.optionGroupService.delete(ctx, group.id);

      if (result.result !== DeletionResult.DELETED) {
        throw new Error(
          `A(z) "${group.code}" natív opciócsoport törlése nem sikerült, mert egy aktív változat még használja az egyik opcióját.`
        );
      }
    }
  }

  /**
   * Batched variant writes in the order Vendure's own validation requires:
   * stale variants are soft-deleted first, then the removed options and
   * groups are deleted (their option deletes report NOT_DELETED while active
   * variants still use them), and only then the existing variants are updated
   * and the missing ones created. A NOT_DELETED or in-use result fails the
   * sync instead of leaving the option exposed on the shop API.
   */
  private async syncVariants(
    ctx: RequestContext,
    nativeProductId: number,
    plan: VariantPlan,
    optionIdsByGroupCode: ReadonlyMap<string, ReadonlyMap<string, number>>,
    facetCodesBySku: ReadonlyMap<string, string[]>,
    facetValueIdsByCode: ReadonlyMap<string, number>,
    removals: OptionGroupRemovals,
    reportProgress: (progress: SyncProgress) => void
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
      relationLoadStrategy: VARIANT_RELATION_LOAD,
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
      const nameChanged = !sameText(textOf(variant.translations, variant.sku), planned.name);
      const inventoryChanged = variant.trackInventory !== GlobalFlag.FALSE;

      if (!optionsChanged && !priceChanged && !nameChanged && !facetsChanged && !inventoryChanged) {
        continue;
      }

      const update: UpdateProductVariantInput = { id: variant.id };

      if (inventoryChanged) {
        update.trackInventory = GlobalFlag.FALSE;
      }

      if (priceChanged) {
        update.price = planned.price;
      }

      if (nameChanged) {
        update.translations = nameTranslations(planned.name);
      }

      if (optionsChanged) {
        update.optionIds = plannedOptionIds;
      }

      if (facetsChanged) {
        update.facetValueIds = plannedFacetIds;
      }

      updates.push(update);
    }

    const stale = existing.filter((variant) => !plannedBySku.has(variant.sku));
    const bulk = !this.bulkVariantWriter.legacyRequested;
    const progress = createProgressCounter(
      missing.length + updates.length + stale.length,
      reportProgress
    );

    if (stale.length > 0) {
      if (bulk) {
        await this.bulkVariantWriter.softDelete(
          ctx,
          stale.map((variant) => Number(variant.id))
        );
      } else {
        await this.variantService.softDelete(
          ctx,
          stale.map((variant) => variant.id)
        );
      }

      progress.advance(stale.length);
    }

    await this.deleteRemovedOptionGroups(ctx, nativeProductId, removals);

    if (updates.length > 0) {
      if (bulk) {
        await this.bulkVariantWriter.update(ctx, updates);
      } else {
        for (let start = 0; start < updates.length; start += BATCH_SIZE) {
          await this.variantService.update(ctx, updates.slice(start, start + BATCH_SIZE));
        }
      }

      progress.advance(updates.length);
    }

    if (missing.length > 0) {
      const plannedCreates: PlannedVariantCreate[] = missing.map((variant) => ({
        sku: variant.sku,
        price: variant.price,
        name: variant.name,
        optionIds: optionIdsFor(variant),
        facetValueIds: facetValueIdsFor(variant.sku),
      }));

      if (bulk) {
        await this.bulkVariantWriter.create(ctx, nativeProductId, plannedCreates);
      } else {
        for (let start = 0; start < missing.length; start += BATCH_SIZE) {
          await this.variantService.create(
            ctx,
            missing.slice(start, start + BATCH_SIZE).map((variant) => ({
              productId: nativeProductId,
              sku: variant.sku,
              price: variant.price,
              optionIds: optionIdsFor(variant),
              facetValueIds: facetValueIdsFor(variant.sku),
              trackInventory: GlobalFlag.FALSE,
              translations: nameTranslations(variant.name),
            }))
          );
        }
      }

      progress.advance(missing.length);
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
          "(a convergeMaterialFacets admin mutationt)."
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

    const variants = await this.connection.getRepository(ctx, ProductVariant).find({
      where: { product: { id: nativeProductId }, deletedAt: IsNull() },
      relationLoadStrategy: VARIANT_RELATION_LOAD,
      relations: {
        options: { group: true },
        translations: true,
        productVariantPrices: true,
        facetValues: true,
      },
    });

    return {
      optionGroups: product.optionGroups
        .filter((group) => group.deletedAt === null)
        .map((group) => ({
          code: group.code,
          name: textOf(group.translations, group.code),
          options: group.options
            .filter((option) => option.deletedAt === null)
            .map((option) => ({
              code: option.code,
              name: textOf(option.translations, option.code),
            })),
        })),
      variants: variants.map((variant) => ({
        sku: variant.sku,
        name: textOf(variant.translations, variant.sku),
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

  /** The native products' hu names keyed by their id, batched — the list and
   * the drift analysis must not query per row. */
  private async nativeNames(
    ctx: RequestContext,
    rows: ProductDefinition[]
  ): Promise<Map<number, LocalizedText>> {
    const ids = rows.flatMap((row) => (row.nativeProductId === null ? [] : [row.nativeProductId]));

    return nativeProductTexts(this.connection, ctx, ids);
  }

  /** Fills the definitions' transient `label` from their native products' hu
   * names (ADR 0011 decision 1) — the table column's value and the sort key. */
  private async withNativeLabels(ctx: RequestContext, rows: ProductDefinition[]): Promise<void> {
    const names = await this.nativeNames(ctx, rows);

    for (const row of rows) {
      const nativeName = row.nativeProductId === null ? undefined : names.get(row.nativeProductId);

      row.label = nativeName?.hu ?? row.productId;
    }
  }

  /** The materials' labels and colors, the two inputs the facet/variant plan reads. */
  private async materialData(ctx: RequestContext): Promise<Map<string, MaterialFacetData>> {
    const materials = await this.connection.getRepository(ctx, Material).find();

    return new Map(
      materials.map((material) => [
        material.slug,
        {
          label: textOf(material.translations.map(labelAsName), material.slug),
          colors: material.colors.map((color) => ({
            id: color.colorId,
            label: textOf(color.translations.map(labelAsName), color.colorId),
          })),
        },
      ])
    );
  }

  private async validatedUnderMaterialLocks(
    input: unknown,
    txCtx: RequestContext,
    preliminary: CanonicalProductDefinition
  ): Promise<CanonicalProductDefinition> {
    await lockMaterials(this.connection, txCtx, materialReferenceSlugs(preliminary), "shared");

    return this.validated(input, txCtx);
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
