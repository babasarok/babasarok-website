import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import {
  EventBus,
  internal_getRequestContext,
  Logger,
  Product,
  TransactionalConnection,
  type RequestContext,
} from "@vendure/core";
import { switchMap, tap, type Observable } from "rxjs";
import { z } from "zod";
import { AuditEntryEvent, auditActor } from "./audit.event";
import { productDetails, type ProductSnapshot } from "./details";

const GUARDED_MUTATION = "updateProduct";

const SavedProductSchema = z.object({ id: z.union([z.number(), z.string()]) });

const TranslationCustomFieldsSchema = z.object({
  shortDescription: z.string().nullish(),
  tagline: z.string().nullish(),
});

/** The translation custom fields the diff tracks, read defensively: Vendure
 * types translation custom fields loosely. */
function customFieldsOf(customFields: unknown): {
  shortDescription: string | null;
  tagline: string | null;
} {
  const parsed = TranslationCustomFieldsSchema.safeParse(customFields);

  return parsed.success
    ? {
        shortDescription: parsed.data.shortDescription ?? null,
        tagline: parsed.data.tagline ?? null,
      }
    : { shortDescription: null, tagline: null };
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) && value !== null ? parsed : null;
}

/** The persisted product state the stock form's save is diffed against. */
async function readSnapshot(
  connection: TransactionalConnection,
  ctx: RequestContext,
  id: number
): Promise<ProductSnapshot | null> {
  const product = await connection.getRepository(ctx, Product).findOne({
    where: { id },
    relations: { translations: true },
  });

  if (product === null) {
    return null;
  }

  const date = product.customFields.date;

  return {
    enabled: product.enabled,
    featuredAssetId: numberOrNull(product.featuredAssetId),
    iconId: numberOrNull(product.customFields.iconId),
    date: date === null ? null : date.toISOString(),
    popularityRank: numberOrNull(product.customFields.popularityRank),
    translations: product.translations.map((translation) => ({
      languageCode: translation.languageCode,
      name: translation.name,
      slug: translation.slug,
      description: translation.description,
      ...customFieldsOf(translation.customFields),
    })),
  };
}

function huNameOf(snapshot: ProductSnapshot): string | null {
  const hu = snapshot.translations.find((translation) => translation.languageCode === "hu");

  return hu === undefined || hu.name === "" ? null : hu.name;
}

/**
 * The audit publisher for stock product edits: only this interceptor sees the
 * before state of an `updateProduct` save, so it owns the row's field-level
 * details (the ProductEvent subscriber records create/delete only).
 */
@Injectable()
export class ProductAuditInterceptor implements NestInterceptor {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<
      { fieldName: string; parentType: { name: string } } | undefined
    >();

    if (info?.parentType.name !== "Mutation" || info.fieldName !== GUARDED_MUTATION) {
      return next.handle();
    }

    const input = gqlContext.getArgs<{ input?: { id?: string | number } }>().input;
    const id = numberOrNull(input?.id);

    if (input === undefined || id === null) {
      return next.handle();
    }

    const req = gqlContext.getContext<{
      req: Parameters<typeof internal_getRequestContext>[0];
    }>().req;
    const ctx = internal_getRequestContext(req);
    const before = await readSnapshot(this.connection, ctx, id);

    if (before === null) {
      return next.handle();
    }

    const handle = next.handle();

    return handle.pipe(
      switchMap((result: unknown) => Promise.resolve(result)),
      tap((result: unknown) => {
        const saved = SavedProductSchema.safeParse(result);

        if (!saved.success) {
          return;
        }

        void this.publish(ctx, id, before);
      })
    );
  }

  /** Runs inside the request's transaction scope, so the after read sees the
   * save this response is about to report. */
  private async publish(ctx: RequestContext, id: number, before: ProductSnapshot): Promise<void> {
    try {
      const after = await readSnapshot(this.connection, ctx, id);

      if (after === null) {
        return;
      }

      await this.eventBus.publish(
        new AuditEntryEvent(ctx, {
          entityType: "product",
          entityKey: String(id),
          action: "updated",
          summary: huNameOf(after),
          details: productDetails(before, after),
          source: "admin",
          actor: auditActor(ctx),
        })
      );
    } catch (error: unknown) {
      // A failed snapshot read must never fail the save it observes.
      Logger.error(
        `A natív termék változásnapló-bejegyzésének előállítása sikertelen (${id}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }
}
