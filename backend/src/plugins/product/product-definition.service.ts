import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import {
  ChannelService,
  DefaultSlugStrategy,
  EventBus,
  LanguageCode,
  Logger,
  Product,
  ProductEvent,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import type { InspectableJobQueueStrategy, Job, JobQueue } from "@vendure/core";
import type {
  JobFilterParameter,
  UpdateProductVariantInput,
} from "@vendure/common/lib/generated-types";
import { GlobalFlag } from "@vendure/common/lib/generated-types";
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
import { LabelSchema } from "../../shared/product-definition/index";
// The node-only entry: productRevision needs node:crypto, which must not reach
// the dashboard's browser bundle through the main barrel.
import { productRevision } from "../../shared/product-definition/node";
import { materialReferenceSlugs, toLanguageCode } from "../material/material.service";
import { Material } from "../material/material.entity";
import { lockMaterials } from "../material/material-lock";
import { AuditEntryEvent, auditActor } from "../audit/audit.event";
import { sortDefinitions } from "./definition-sort";
import { deletedNativeProductId, updatedNativeProductId } from "./product-event";
import { SyncJobDataSchema, updateInputCarriesName, type SyncJobData } from "./sync-decision";
import { validateProductDefinition } from "./product-definition";
import { ProductDefinition } from "./product.entity";
import { memoPerRequest } from "./request-memo";
import { definitionsToRequeue } from "./sync-recovery";
import { huName, nativeProductTexts, textOf } from "./native-names";
import {
  plannedVariant,
  variantDrift,
  type VariantDrift,
  type VariantState,
} from "./single-variant";

function nameTranslations(
  text: LocalizedText
): Array<{ languageCode: LanguageCode; name: string }> {
  return Object.entries(text).map(([language, name]) => ({
    languageCode: toLanguageCode(language),
    name,
  }));
}

/** Jobs per page when inspecting the queue, within Vendure's list-query limit. */
const JOB_PAGE_SIZE = 100;

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
    const page = await strategy.findMany({ filter, skip: jobs.length, take: JOB_PAGE_SIZE });
    jobs.push(...page.items);

    if (page.items.length < JOB_PAGE_SIZE) {
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
    private variantService: ProductVariantService,
    private jobQueueService: JobQueueService,
    private configService: ConfigService,
    private requestContextService: RequestContextService,
    private channelService: ChannelService,
    private eventBus: EventBus,
    private processContext: ProcessContext
  ) {}

  /** The server process only enqueues; the worker process runs the syncs. */
  async onApplicationBootstrap(): Promise<void> {
    this.syncQueue = await this.jobQueueService.createQueue({
      name: SYNC_QUEUE_NAME,
      process: async (job) => {
        await this.processSyncJob(SyncJobDataSchema.parse(job.data));
      },
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
      await this.syncQueue.add({ productId, origin: "automatic", actor: null });
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
    await this.publishDefinitionAudit(ctx, row.productId, "created", parsedName.data);

    return row;
  }

  async updateProductDefinition(
    ctx: RequestContext,
    productId: string,
    input: unknown
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
    await this.publishDefinitionAudit(ctx, row.productId, "updated", row.label);

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

    await this.publishDefinitionAudit(ctx, productId, "deleted", existing.label);

    return true;
  }

  /** The definition row's label, resolved on the admin request that writes it. */
  private async publishDefinitionAudit(
    ctx: RequestContext,
    productId: string,
    action: "created" | "updated" | "deleted",
    label: string | null
  ): Promise<void> {
    await this.eventBus.publish(
      new AuditEntryEvent(ctx, {
        entityType: "product-definition",
        entityKey: productId,
        action,
        summary: label,
        source: "admin",
        actor: auditActor(ctx),
      })
    );
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

  /** Whether a sync would change the native variant right now. */
  async staleness(ctx: RequestContext, rows: ProductDefinition[]): Promise<Map<string, boolean>> {
    const analysis = await this.driftAnalysis(ctx, rows);

    return new Map([...analysis].map(([productId, drift]) => [productId, drift.length > 0]));
  }

  /**
   * What a sync would change on each definition's native variant right now:
   * the definition, the product's name or the variant itself moved since the
   * last sync. Empty when the native variant matches the plan.
   */
  async driftAnalysis(
    ctx: RequestContext,
    rows: ProductDefinition[]
  ): Promise<Map<string, VariantDrift[]>> {
    const nativeIds = rows.flatMap((row) =>
      row.nativeProductId === null ? [] : [row.nativeProductId]
    );
    const names = await nativeProductTexts(this.connection, ctx, nativeIds);
    const variants = await this.liveVariants(ctx, nativeIds);
    const analysis = new Map<string, VariantDrift[]>();

    for (const row of rows) {
      if (row.nativeProductId === null) {
        analysis.set(row.productId, []);
        continue;
      }

      const planned = plannedVariant(row.definition, names.get(row.nativeProductId) ?? { hu: "" });

      analysis.set(row.productId, variantDrift(planned, variants.get(row.nativeProductId) ?? []));
    }

    return analysis;
  }

  /**
   * Stock product writes find their generated definition: a delete cascades
   * to it (ADR 0011 decision 4 — the configurator's own delete removes the
   * definition first, so this finds nothing to do there), and a rename
   * re-enqueues its sync, since the variant is named after the product
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

      if (row !== null) {
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
      // The actor rides the job data: the worker's synthetic context has no
      // user, so the enqueueing admin is only known here.
      await this.syncQueue.add({ productId, origin, actor: auditActor(ctx) });
    } catch (error: unknown) {
      await this.connection
        .getRepository(ctx, ProductDefinition)
        .update({ productId }, { syncState: "failed", syncError: String(error) });

      throw error;
    }
  }

  /** The worker-side sync of a definition's current stored state. */
  private async processSyncJob({ productId, actor }: SyncJobData): Promise<void> {
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

        await this.sync(txCtx, nativeProductId, row.definition);
        await this.connection
          .getRepository(txCtx, ProductDefinition)
          .update({ productId }, { syncState: "synced", syncError: null });
      });

      await this.publishSyncAudit(ctx, productId, "synced", null, actor);
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
      await this.publishSyncAudit(ctx, productId, "sync-failed", null, actor);

      throw error;
    }
  }

  /** One audit row per sync job, attributed to the enqueueing admin (ADR 0015). */
  private async publishSyncAudit(
    ctx: RequestContext,
    productId: string,
    action: "synced" | "sync-failed",
    summary: string | null,
    actor: SyncJobData["actor"]
  ): Promise<void> {
    await this.eventBus.publish(
      new AuditEntryEvent(ctx, {
        entityType: "product-definition",
        entityKey: productId,
        action,
        summary,
        source: "sync",
        actor,
      })
    );
  }

  /** Job handlers run outside any request; the sync needs the default channel. */
  private async jobContext(): Promise<RequestContext> {
    const defaultChannel = await this.channelService.getDefaultChannel();

    return this.requestContextService.create({ apiType: "admin", channelOrToken: defaultChannel });
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
   * Writes the one variant the definition plans (ADR 0016): creates it when
   * missing, otherwise updates what differs and drops translations of
   * languages the product no longer has. A generated product with more than
   * one live variant is a broken state the sync refuses to guess about.
   */
  private async sync(
    ctx: RequestContext,
    nativeProductId: number,
    definition: CanonicalProductDefinition
  ): Promise<void> {
    const product = await this.connection.getRepository(ctx, Product).findOne({
      where: { id: nativeProductId, deletedAt: IsNull() },
      relations: { translations: true },
    });

    if (product === null) {
      throw new Error(`A szinkronizált natív termék eltűnt: ${nativeProductId}`);
    }

    // The variant name reads the native product's names (ADR 0011 decision
    // 1); the sync never writes the product's own name or slug.
    if (huName(product.translations) === undefined) {
      throw new Error(`A natív terméknek nincs magyar nyelvű neve: ${nativeProductId}`);
    }

    const planned = plannedVariant(definition, textOf(product.translations, ""));
    const variants = await this.connection.getRepository(ctx, ProductVariant).find({
      where: { productId: nativeProductId, deletedAt: IsNull() },
      relations: { translations: true, productVariantPrices: true },
    });

    if (variants.length > 1) {
      throw new Error(
        `A(z) "${definition.id}" termékhez ${variants.length} élő változat tartozik egy helyett.`
      );
    }

    const existing = variants.at(0);

    if (existing === undefined) {
      await this.variantService.create(ctx, [
        {
          productId: nativeProductId,
          sku: planned.sku,
          price: planned.price,
          trackInventory: GlobalFlag.FALSE,
          translations: nameTranslations(planned.name),
        },
      ]);
      return;
    }

    const current = this.variantState(ctx, existing);
    const update: UpdateProductVariantInput = { id: existing.id };
    let changed = existing.trackInventory !== GlobalFlag.FALSE;

    if (changed) {
      update.trackInventory = GlobalFlag.FALSE;
    }

    for (const drift of variantDrift(planned, [current])) {
      changed = true;

      if (drift.kind === "sku") {
        update.sku = planned.sku;
      }

      if (drift.kind === "price") {
        update.price = planned.price;
      }

      if (drift.kind === "rename") {
        update.translations = nameTranslations(planned.name);
      }
    }

    if (changed) {
      await this.variantService.update(ctx, [update]);
    }

    await this.connection
      .getRepository(ctx, ProductVariant)
      .manager.query(
        `delete from product_variant_translation where "baseId" = $1 and not ("languageCode" = any($2))`,
        [existing.id, Object.keys(planned.name)]
      );
  }

  /** The live variants of the native products, keyed by product id. */
  private async liveVariants(
    ctx: RequestContext,
    nativeProductIds: readonly number[]
  ): Promise<Map<number, VariantState[]>> {
    const byProduct = new Map<number, VariantState[]>();

    if (nativeProductIds.length === 0) {
      return byProduct;
    }

    const variants = await this.connection.getRepository(ctx, ProductVariant).find({
      where: { productId: In(nativeProductIds), deletedAt: IsNull() },
      relations: { translations: true, productVariantPrices: true },
    });

    for (const variant of variants) {
      const productId = Number(variant.productId);

      byProduct.set(productId, [
        ...(byProduct.get(productId) ?? []),
        this.variantState(ctx, variant),
      ]);
    }

    return byProduct;
  }

  private variantState(ctx: RequestContext, variant: ProductVariant): VariantState {
    return {
      sku: variant.sku,
      name: textOf(variant.translations, variant.sku),
      price:
        variant.productVariantPrices.find((price) => price.channelId === ctx.channelId)?.price ?? 0,
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
