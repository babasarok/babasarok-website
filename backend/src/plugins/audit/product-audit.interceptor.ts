import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import {
  EventBus,
  internal_getRequestContext,
  Logger,
  TransactionalConnection,
  type RequestContext,
} from "@vendure/core";
import { switchMap, tap, type Observable } from "rxjs";
import { z } from "zod";
import { AuditEntryEvent, auditActor } from "./audit.event";
import { productDetails, type ProductSnapshot } from "./details";
import { huNameOf, readSnapshot } from "./product-snapshot";

const GUARDED_MUTATION = "updateProduct";

const SavedProductSchema = z.object({ id: z.union([z.number(), z.string()]) });

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) && value !== null ? parsed : null;
}

/**
 * The audit publisher for stock product edits: only this interceptor sees the
 * before state of an `updateProduct` save, so it owns the row's field-level
 * details (the ProductEvent subscriber records create/delete only). Product
 * writes that bypass the mutation (e.g. the translation-drift plugin's fix)
 * publish their own row from the same snapshot helpers.
 */
@Injectable()
export class ProductAuditInterceptor implements NestInterceptor {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType<"http" | "graphql">() !== "graphql") {
      // REST controllers (e.g. the Barion callback) carry no GraphQL info.
      return next.handle();
    }

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
