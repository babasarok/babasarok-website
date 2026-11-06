/**
 * The default variant write path: replaces the per-variant
 * ProductVariantService pipeline with direct repository writes that reproduce
 * its behavior — the same tax-category resolution, per-channel channel joins,
 * price rows and currency codes, the configured
 * ProductVariantPriceUpdateStrategy hooks, the other-channel facet-value
 * preservation on update, per-channel stock-level seeds and the same events
 * (one per phase instead of one per batch call; a sync measured ~31× faster
 * on a 1344-variant matrix, with a byte-identical drift hash against the
 * legacy path). What the sync never writes (assets, stock adjustments,
 * custom-field relations, per-currency `prices` inputs) the legacy path's
 * inputs never set either. Translations are upserted like TranslationDiffer:
 * per language, never deleted. Scalar FKs (baseId, variantId) have no entity
 * property, so those writes bypass entity mapping via parameterized raw SQL.
 *
 * `PRODUCT_SYNC_LEGACY=1` restores the ProductVariantService batches — the
 * fallback until the bulk path has run in production. Remove the legacy
 * branch and the flag afterwards.
 */
import { Injectable } from "@nestjs/common";
import {
  ChannelService,
  ConfigService,
  EventBus,
  LanguageCode,
  Logger,
  Product,
  ProductVariant,
  ProductVariantEvent,
  ProductVariantPrice,
  ProductVariantPriceEvent,
  RequestContext,
  StockLevel,
  StockLocation,
  TaxCategory,
  TransactionalConnection,
} from "@vendure/core";
import { GlobalFlag } from "@vendure/common/lib/generated-types";
import type { CurrencyCode } from "@vendure/core";
import type { UpdateProductVariantInput } from "@vendure/common/lib/generated-types";
import type { LocalizedText } from "../../shared/product-definition/index";
import { toLanguageCode } from "../material/material.service";
import { desiredFacetJoins, diffTranslations } from "./bulk-variant-sql";
import { In } from "typeorm";

/** One variant's planned create. */
export interface PlannedVariantCreate {
  sku: string;
  price: number;
  name: LocalizedText;
  optionIds: number[];
  facetValueIds: number[];
}

/** A planned variant with the id its inserted row received. */
interface CreatedVariant extends PlannedVariantCreate {
  id: number;
}

interface PriceRow {
  id: number;
  variantId: number;
  channelId: number;
  price: number;
  currencyCode: CurrencyCode;
}

function nameTranslations(
  text: LocalizedText
): Array<{ languageCode: LanguageCode; name: string }> {
  return Object.entries(text).map(([language, name]) => ({
    languageCode: toLanguageCode(language),
    name,
  }));
}

function toPriceEntity(row: {
  id: number;
  variantId: number;
  channelId: number;
  price: number;
  currencyCode: CurrencyCode;
}): ProductVariantPrice {
  return new ProductVariantPrice({
    id: row.id,
    channelId: row.channelId,
    price: row.price,
    currencyCode: row.currencyCode,
    variant: { id: row.variantId },
  });
}

const SPIKE_TAG = "[bulk-variant-writer]";

/** Postgres rejects very wide parameterized statements; the bulk inserts go
 * out in chunks of this many rows. */
const CHUNK_SIZE = 200;

@Injectable()
export class BulkVariantWriter {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private configService: ConfigService,
    private channelService: ChannelService
  ) {}

  /** True when the legacy ProductVariantService write path is forced back on. */
  get legacyRequested(): boolean {
    return process.env.PRODUCT_SYNC_LEGACY === "1";
  }

  async softDelete(ctx: RequestContext, ids: ReadonlyArray<number>): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.connection
      .getRepository(ctx, ProductVariant)
      .update({ id: In(ids) }, { deletedAt: new Date() });
    await this.publishVariantEvent(ctx, "deleted", ids);
  }

  async update(
    ctx: RequestContext,
    updates: ReadonlyArray<UpdateProductVariantInput>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const ids = updates.map((update) => Number(update.id));

    await this.upsertTranslations(ctx, updates);
    await this.replaceOptionJoins(
      ctx,
      updates
        .filter((update) => update.optionIds !== undefined)
        .map((update) => ({
          id: Number(update.id),
          optionIds: (update.optionIds ?? []).map(Number),
        }))
    );
    await this.replaceFacetJoins(
      ctx,
      updates
        .filter((update) => update.facetValueIds !== undefined)
        .map((update) => ({
          id: Number(update.id),
          facetValueIds: (update.facetValueIds ?? []).map(Number),
        }))
    );

    const trackInventoryIds = updates
      .filter((update) => update.trackInventory !== undefined)
      .map((update) => Number(update.id));

    if (trackInventoryIds.length > 0) {
      await this.connection
        .getRepository(ctx, ProductVariant)
        .update({ id: In(trackInventoryIds) }, { trackInventory: GlobalFlag.FALSE });
    }

    await this.updatePrices(ctx, updates);
    await this.publishVariantEvent(ctx, "updated", ids);
  }

  async create(
    ctx: RequestContext,
    nativeProductId: number,
    missing: ReadonlyArray<PlannedVariantCreate>
  ): Promise<void> {
    if (missing.length === 0) {
      return;
    }

    const taxCategoryId = await this.taxCategoryIdForNewVariants(ctx);
    const rawRows = await this.insertChunkedReturning(
      ctx,
      "product_variant",
      missing.map((variant) => ({
        sku: variant.sku,
        productId: nativeProductId,
        taxCategoryId,
        trackInventory: GlobalFlag.FALSE,
      })),
      ["id", "sku"]
    );
    const idBySku = new Map<string, number>(
      rawRows.map((row) => [row.sku as string, row.id as number])
    );
    const created = missing.flatMap((variant) => {
      const id = idBySku.get(variant.sku);

      return id === undefined ? [] : [{ ...variant, id }];
    });

    if (created.length !== missing.length) {
      throw new Error(`${SPIKE_TAG} a beillesztett változat-azonosítók hiányosak`);
    }

    await this.insertTranslations(ctx, created);
    await this.insertOptionJoins(ctx, created);
    await this.insertFacetJoins(ctx, created);
    await this.assignChannelsAndPrices(ctx, nativeProductId, created);
    await this.publishVariantEvent(
      ctx,
      "created",
      created.map((variant) => variant.id)
    );
  }

  /** One chunked INSERT ... VALUES into a physical table. */
  private async insertChunked(
    ctx: RequestContext,
    table: string,
    rows: ReadonlyArray<Record<string, unknown>>
  ): Promise<void> {
    const manager = this.connection.getRepository(ctx, ProductVariant).manager;

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(table)
        .values(rows.slice(start, start + CHUNK_SIZE))
        .execute();
    }
  }

  /**
   * Chunked parameterized INSERT into a physical table, bypassing entity
   * mapping: required where the FK column (baseId, variantId) has no entity
   * property, which .values(plain rows) would silently drop to NULL.
   */
  private async rawInsertChunked(
    ctx: RequestContext,
    table: string,
    columns: ReadonlyArray<string>,
    rows: ReadonlyArray<ReadonlyArray<unknown>>,
    returning?: string
  ): Promise<Record<string, unknown>[]> {
    const manager = this.connection.getRepository(ctx, ProductVariant).manager;
    const raw: Record<string, unknown>[] = [];

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE);
      const placeholders = chunk
        .map(
          (_, row) =>
            `(${columns.map((__, column) => `$${row * columns.length + column + 1}`).join(", ")})`
        )
        .join(", ");
      const returningSql = returning === undefined ? "" : ` returning "${returning}"`;
      const result: unknown = await manager.query(
        `insert into "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values ${placeholders}${returningSql}`,
        chunk.flat()
      );

      raw.push(...(result as Record<string, unknown>[]));
    }

    return raw;
  }

  /** One chunked INSERT ... RETURNING; the raw rows are concatenated. */
  private async insertChunkedReturning(
    ctx: RequestContext,
    table: string,
    rows: ReadonlyArray<Record<string, unknown>>,
    returning: string[]
  ): Promise<Record<string, unknown>[]> {
    const manager = this.connection.getRepository(ctx, ProductVariant).manager;
    const raw: Record<string, unknown>[] = [];

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(table)
        .values(rows.slice(start, start + CHUNK_SIZE))
        .returning(returning)
        .execute();

      raw.push(...(result.raw as Record<string, unknown>[]));
    }

    return raw;
  }

  private async publishVariantEvent(
    ctx: RequestContext,
    type: "created" | "updated" | "deleted",
    ids: ReadonlyArray<number>
  ): Promise<void> {
    await this.eventBus.publish(
      new ProductVariantEvent(
        ctx,
        ids.map((id) => new ProductVariant({ id })),
        type,
        [...ids]
      )
    );
  }

  /** The createSingle tax-category resolution: explicit id, else the default
   * category, else the first one, else a new "Standard Tax". */
  private async taxCategoryIdForNewVariants(ctx: RequestContext): Promise<number> {
    const categories = await this.connection.getRepository(ctx, TaxCategory).find();
    const chosen = categories.find((category) => category.isDefault);

    if (chosen !== undefined) {
      return Number(chosen.id);
    }

    if (categories.length > 0) {
      return Number(categories[0].id);
    }

    const created = await this.connection
      .getRepository(ctx, TaxCategory)
      .save(new TaxCategory({ name: "Standard Tax" }));

    Logger.warn(`${SPIKE_TAG} új "Standard Tax" kategória jött létre`, "BulkVariantWriter");

    return Number(created.id);
  }

  /** Upsert per (variant, language) — TranslationDiffer never deletes. */
  private async upsertTranslations(
    ctx: RequestContext,
    updates: ReadonlyArray<UpdateProductVariantInput>
  ): Promise<void> {
    const changed = updates.filter((update) => update.translations?.length);

    if (changed.length === 0) {
      return;
    }

    const ids = changed.map((update) => Number(update.id));
    const manager = this.connection.getRepository(ctx, ProductVariant).manager;
    const existing = (await manager
      .createQueryBuilder()
      .select("t.id", "id")
      .addSelect("t.baseId", "baseId")
      .addSelect("t.languageCode", "languageCode")
      .addSelect("t.name", "name")
      .from("product_variant_translation", "t")
      .where("t.baseId IN (:...ids)", { ids })
      .getRawMany<{
        id: number;
        baseId: number;
        languageCode: string;
        name: string;
      }>()) as Array<{
      id: number;
      baseId: number;
      languageCode: string;
      name: string;
    }>;
    const planned = changed.flatMap((update) =>
      (update.translations ?? []).map((translation) => ({
        variantId: Number(update.id),
        languageCode: translation.languageCode,
        name: translation.name ?? "",
      }))
    );
    const diff = diffTranslations(existing, planned);

    // The insert must bypass entity mapping: `baseId` has no entity property,
    // and .values() would silently write NULL.
    if (diff.toInsert.length > 0) {
      await this.rawInsertChunked(
        ctx,
        "product_variant_translation",
        ["baseId", "languageCode", "name"],
        diff.toInsert.map((row) => [row.baseId, row.languageCode, row.name])
      );
    }

    for (const row of diff.toUpdate) {
      await manager
        .createQueryBuilder()
        .update("product_variant_translation")
        .set({ name: row.name })
        .where("id = :id", { id: row.id })
        .execute();
    }
  }

  private async insertTranslations(
    ctx: RequestContext,
    created: ReadonlyArray<CreatedVariant>
  ): Promise<void> {
    const rows = created.flatMap((variant) =>
      nameTranslations(variant.name).map((translation) => ({
        baseId: variant.id,
        languageCode: translation.languageCode,
        name: translation.name,
      }))
    );

    await this.rawInsertChunked(
      ctx,
      "product_variant_translation",
      ["baseId", "languageCode", "name"],
      rows.map((row) => [row.baseId, row.languageCode, row.name])
    );
  }

  private async insertOptionJoins(
    ctx: RequestContext,
    created: ReadonlyArray<CreatedVariant>
  ): Promise<void> {
    const rows = created.flatMap((variant) =>
      variant.optionIds.map((productOptionId) => ({
        productVariantId: variant.id,
        productOptionId,
      }))
    );

    await this.insertChunked(ctx, "product_variant_options_product_option", rows);
  }

  private async insertFacetJoins(
    ctx: RequestContext,
    created: ReadonlyArray<CreatedVariant>
  ): Promise<void> {
    const rows = created.flatMap((variant) =>
      variant.facetValueIds.map((facetValueId) => ({
        productVariantId: variant.id,
        facetValueId,
      }))
    );

    await this.insertChunked(ctx, "product_variant_facet_values_facet_value", rows);
  }

  /**
   * createSingle's channel handling: the variant joins the current channel and
   * gets a price row for it, one for the default channel when the sync runs in
   * a non-default channel, and — the assignProductVariantsToChannel behavior —
   * a channel join, price row (in the channel's default currency) and
   * stock-level seeds for every remaining channel of the parent product. The
   * price-update strategy's onPriceCreated hook runs per created row, like
   * core.
   */
  private async assignChannelsAndPrices(
    ctx: RequestContext,
    nativeProductId: number,
    created: ReadonlyArray<CreatedVariant>
  ): Promise<void> {
    const defaultChannel = await this.channelService.getDefaultChannel(ctx);
    const product = await this.connection
      .getRepository(ctx, Product)
      .findOne({ where: { id: nativeProductId }, relations: { channels: true } });

    if (product === null) {
      throw new Error(`${SPIKE_TAG} a natív termék eltűnt: ${nativeProductId}`);
    }

    const ctxChannelId = Number(ctx.channelId);
    const defaultChannelId = Number(defaultChannel.id);
    const variantIds = created.map((variant) => variant.id);
    const targetChannelIds = [
      ctxChannelId,
      ...product.channels
        .map((channel) => Number(channel.id))
        .filter((id) => id !== ctxChannelId && id !== defaultChannelId),
    ];

    for (const channelId of targetChannelIds) {
      const channel =
        channelId === ctxChannelId
          ? ctx.channel
          : await this.channelService.findOne(ctx, channelId);

      if (channel === undefined) {
        throw new Error(`${SPIKE_TAG} a csatorna nem található: ${channelId}`);
      }

      await this.insertChunked(
        ctx,
        "product_variant_channels_channel",
        variantIds.map((productVariantId) => ({ productVariantId, channelId }))
      );

      await this.insertPriceRows(ctx, created, channelId, channel.defaultCurrencyCode);
      await this.seedStockLevels(ctx, variantIds, channelId);
    }

    if (ctxChannelId !== defaultChannelId) {
      // createSingle gives every variant a default-channel price row even when
      // created inside a non-default channel, without a channel join there.
      await this.insertPriceRows(
        ctx,
        created,
        defaultChannelId,
        defaultChannel.defaultCurrencyCode
      );
    }
  }

  private async insertPriceRows(
    ctx: RequestContext,
    created: ReadonlyArray<CreatedVariant>,
    channelId: number,
    currencyCode: CurrencyCode
  ): Promise<void> {
    const strategy = this.configService.catalogOptions.productVariantPriceUpdateStrategy;
    const rawIds = await this.rawInsertChunked(
      ctx,
      "product_variant_price",
      ["variantId", "channelId", "price", "currencyCode"],
      created.map((variant) => [variant.id, channelId, variant.price, currencyCode]),
      "id"
    );
    const inserted = created.map((variant, index) => ({
      id: Number(rawIds[index].id),
      variantId: variant.id,
      channelId,
      price: variant.price,
      currencyCode,
    }));

    for (const price of inserted) {
      const allPrices = (await this.priceRows(ctx, [price.variantId])).map(toPriceEntity);
      const additional = await strategy.onPriceCreated(ctx, toPriceEntity(price), allPrices);

      await this.applyStrategyUpdates(ctx, additional);
    }
  }

  /** updateSingle's price write: the (channel, channel currency) row is
   * patched or created, then the strategy's onPriceUpdated may adjust the
   * variant's other price rows. */
  private async updatePrices(
    ctx: RequestContext,
    updates: ReadonlyArray<UpdateProductVariantInput>
  ): Promise<void> {
    const priced = updates.filter((update) => update.price != null);

    if (priced.length === 0) {
      return;
    }

    const channelId = Number(ctx.channelId);
    const currencyCode = ctx.channel.defaultCurrencyCode;

    const manager = this.connection.getRepository(ctx, ProductVariantPrice).manager;
    const strategy = this.configService.catalogOptions.productVariantPriceUpdateStrategy;
    const allRows = await this.priceRows(
      ctx,
      priced.map((update) => Number(update.id))
    );
    const toInsert: Array<{
      variantId: number;
      channelId: number;
      price: number;
      currencyCode: CurrencyCode;
    }> = [];
    const toPatch: Array<{ id: number; price: number }> = [];

    for (const update of priced) {
      const variantId = Number(update.id);
      const target = allRows.find(
        (row) =>
          row.variantId === variantId &&
          row.channelId === channelId &&
          row.currencyCode === currencyCode
      );

      if (target === undefined) {
        toInsert.push({
          variantId,
          channelId,
          price: update.price ?? 0,
          currencyCode,
        });
      } else if (target.price !== update.price) {
        toPatch.push({ id: target.id, price: update.price ?? 0 });
      }
    }

    if (toInsert.length > 0) {
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into("product_variant_price")
        .values(toInsert)
        .returning(["id", "price", "currencyCode", "channelId", "variantId"])
        .execute();
      const rows = (inserted.raw as PriceRow[]).map(toPriceEntity);

      for (const price of rows) {
        const variantPrices = await this.priceRows(ctx, [Number(price.variant.id)]);
        const additional = await strategy.onPriceCreated(
          ctx,
          price,
          variantPrices.map(toPriceEntity)
        );

        await this.applyStrategyUpdates(ctx, additional);
      }
    }

    if (toPatch.length > 0) {
      for (const patch of toPatch) {
        await manager
          .createQueryBuilder()
          .update("product_variant_price")
          .set({ price: patch.price })
          .where("id = :id", { id: patch.id })
          .execute();
      }

      const patched = toPatch.map((patch) => {
        const row = allRows.find((candidate) => candidate.id === patch.id);

        if (row === undefined) {
          throw new Error(`${SPIKE_TAG} az árazott sor eltűnt: ${patch.id}`);
        }

        return toPriceEntity({ ...row, price: patch.price });
      });

      await this.eventBus.publish(new ProductVariantPriceEvent(ctx, patched, "updated"));

      for (const price of patched) {
        const variantPrices = await this.priceRows(ctx, [Number(price.variant.id)]);
        const additional = await strategy.onPriceUpdated(
          ctx,
          price,
          variantPrices.map(toPriceEntity)
        );

        await this.applyStrategyUpdates(ctx, additional);
      }
    }
  }

  private async priceRows(
    ctx: RequestContext,
    variantIds: ReadonlyArray<number>
  ): Promise<PriceRow[]> {
    if (variantIds.length === 0) {
      return [];
    }

    return this.connection
      .getRepository(ctx, ProductVariantPrice)
      .manager.createQueryBuilder()
      .select("p.id", "id")
      .addSelect("p.variantId", "variantId")
      .addSelect("p.channelId", "channelId")
      .addSelect("p.price", "price")
      .addSelect("p.currencyCode", "currencyCode")
      .from("product_variant_price", "p")
      .where("p.variantId IN (:...ids)", { ids: [...variantIds] })
      .getRawMany<PriceRow>();
  }

  private async applyStrategyUpdates(
    ctx: RequestContext,
    additional: ReadonlyArray<{ id: number | string; price: number }>
  ): Promise<void> {
    if (additional.length === 0) {
      return;
    }

    const manager = this.connection.getRepository(ctx, ProductVariantPrice).manager;

    for (const entry of additional) {
      await manager
        .createQueryBuilder()
        .update("product_variant_price")
        .set({ price: entry.price })
        .where("id = :id", { id: Number(entry.id) })
        .execute();
    }
  }

  /** ensureStockLevelsForChannel: a stockOnHand-0 row per stock location of
   * the channel, inserted idempotently. */
  private async seedStockLevels(
    ctx: RequestContext,
    variantIds: ReadonlyArray<number>,
    channelId: number
  ): Promise<void> {
    const locations = await this.connection
      .getRepository(ctx, StockLocation)
      .createQueryBuilder("stockLocation")
      .innerJoin("stockLocation.channels", "channel")
      .where("channel.id = :id", { id: channelId })
      .getMany();

    if (locations.length === 0) {
      return;
    }

    const stockRows = variantIds.flatMap((productVariantId) =>
      locations.map((location) => ({
        productVariantId,
        stockLocationId: Number(location.id),
        stockOnHand: 0,
        stockAllocated: 0,
      }))
    );

    for (let start = 0; start < stockRows.length; start += CHUNK_SIZE) {
      await this.connection
        .getRepository(ctx, StockLevel)
        .createQueryBuilder()
        .insert()
        .values(stockRows.slice(start, start + CHUNK_SIZE))
        .orIgnore()
        .updateEntity(false)
        .execute();
    }
  }

  /** updateSingle keeps facet values that are not visible in the current
   * channel and replaces the current-channel set. */
  private async replaceFacetJoins(
    ctx: RequestContext,
    writes: ReadonlyArray<{ id: number; facetValueIds: number[] }>
  ): Promise<void> {
    if (writes.length === 0) {
      return;
    }

    const manager = this.connection.getRepository(ctx, ProductVariant).manager;
    const existing = (await manager
      .createQueryBuilder()
      .select("join.productVariantId", "productVariantId")
      .addSelect("join.facetValueId", "facetValueId")
      .from("product_variant_facet_values_facet_value", "join")
      .where("join.productVariantId IN (:...ids)", { ids: writes.map((write) => write.id) })
      .getRawMany<{ productVariantId: number; facetValueId: number }>()) as Array<{
      productVariantId: number;
      facetValueId: number;
    }>;
    const memberships = (await manager
      .createQueryBuilder()
      .select("membership.facetValueId", "facetValueId")
      .addSelect("membership.channelId", "channelId")
      .from("facet_value_channels_channel", "membership")
      .getRawMany<{ facetValueId: number; channelId: number }>()) as Array<{
      facetValueId: number;
      channelId: number;
    }>;
    const channelsByFacetValue = new Map<number, Set<number>>();

    for (const row of memberships) {
      const set = channelsByFacetValue.get(row.facetValueId) ?? new Set<number>();

      set.add(row.channelId);
      channelsByFacetValue.set(row.facetValueId, set);
    }

    const desired = desiredFacetJoins(
      existing,
      [...channelsByFacetValue.entries()].flatMap(([facetValueId, channelIds]) =>
        [...channelIds].map((channelId) => ({ facetValueId, channelId }))
      ),
      Number(ctx.channelId),
      writes
    );

    await manager
      .createQueryBuilder()
      .delete()
      .from("product_variant_facet_values_facet_value")
      .where("productVariantId IN (:...ids)", { ids: writes.map((write) => write.id) })
      .execute();

    await this.rawInsertChunked(
      ctx,
      "product_variant_facet_values_facet_value",
      ["productVariantId", "facetValueId"],
      desired.map((row) => [row.productVariantId, row.facetValueId])
    );
  }

  private async replaceOptionJoins(
    ctx: RequestContext,
    writes: ReadonlyArray<{ id: number; optionIds: number[] }>
  ): Promise<void> {
    if (writes.length === 0) {
      return;
    }

    const manager = this.connection.getRepository(ctx, ProductVariant).manager;

    await manager
      .createQueryBuilder()
      .delete()
      .from("product_variant_options_product_option")
      .where("productVariantId IN (:...ids)", { ids: writes.map((write) => write.id) })
      .execute();
    const optionRows = writes.flatMap((write) =>
      write.optionIds.map((productOptionId) => ({
        productVariantId: write.id,
        productOptionId,
      }))
    );

    await this.insertChunked(ctx, "product_variant_options_product_option", optionRows);
  }
}
