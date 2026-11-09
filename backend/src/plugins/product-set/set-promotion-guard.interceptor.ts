import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import {
  EventBus,
  internal_getRequestContext,
  Promotion,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { IsNull } from "typeorm";
import type {
  CreatePromotionInput,
  ConfigurableOperationInput,
  UpdatePromotionInput,
} from "@vendure/common/lib/generated-types";
import { switchMap, tap, type Observable } from "rxjs";
import { z } from "zod";
import {
  huName,
  memberIdsFromArgs,
  amountFromArgs,
  PRODUCT_SET_ACTION_CODE,
  PRODUCT_SET_CONDITION_CODE,
} from "./set-basket";
import { AuditEntryEvent, auditActor } from "../audit/audit.event";

const GUARDED_MUTATIONS = new Set(["createPromotion", "updatePromotion"]);

type GuardedArgs = { input?: CreatePromotionInput | UpdatePromotionInput };

const SavedPromotionSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  translations: z.array(z.object({ languageCode: z.string(), name: z.string() })).default([]),
});

interface ConditionArgs {
  condition: ConfigurableOperationInput | undefined;
  action: ConfigurableOperationInput | undefined;
}

/**
 * The save-time guard for set promotions (ADR 0014): the members condition and
 * the allocation action belong together, the amount is a positive whole Ft,
 * and two active promotions must not list the same product — the invariant the
 * runtime allocation refuses to break.
 */
@Injectable()
export class SetPromotionGuardInterceptor implements NestInterceptor {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<
      { fieldName: string; parentType: { name: string } } | undefined
    >();

    if (info?.parentType.name !== "Mutation" || !GUARDED_MUTATIONS.has(info.fieldName)) {
      return next.handle();
    }

    const input = gqlContext.getArgs<GuardedArgs>().input;
    const isSet = input !== undefined && this.isSetPromotion(input);

    if (input !== undefined) {
      await this.violation(info.fieldName, input);
    }

    const handle = next.handle();

    if (!isSet) {
      return handle;
    }

    // Only set promotions are logged; the guard is the one hook that sees
    // these stock mutations (ADR 0015 — Vendure publishes no PromotionEvent).
    // The handler emits its unresolved promise, and a rejected save comes back
    // as an ErrorResult value (no id) — only a saved Promotion is logged.
    const req = gqlContext.getContext<{
      req: Parameters<typeof internal_getRequestContext>[0];
    }>().req;
    const ctx = internal_getRequestContext(req);
    const action = info.fieldName === "createPromotion" ? "created" : "updated";

    return handle.pipe(
      switchMap((result: unknown) => Promise.resolve(result)),
      tap((result: unknown) => {
        const saved = SavedPromotionSchema.safeParse(result);

        if (!saved.success) {
          return;
        }

        void this.eventBus.publish(
          new AuditEntryEvent(ctx, {
            entityType: "promotion",
            entityKey: String(saved.data.id),
            action,
            summary: huName(saved.data.translations) ?? saved.data.name ?? null,
            source: "admin",
            actor: auditActor(ctx),
          })
        );
      })
    );
  }

  private isSetPromotion(input: CreatePromotionInput | UpdatePromotionInput): boolean {
    const own = this.ownOperations(input);

    return own.condition !== undefined && own.action !== undefined;
  }

  private async violation(
    mutation: string,
    input: CreatePromotionInput | UpdatePromotionInput
  ): Promise<void> {
    const own = this.ownOperations(input);

    if (own.condition === undefined && own.action === undefined) {
      return;
    }

    if (own.condition === undefined || own.action === undefined) {
      throw new UserInputError(
        "A szett-kedvezmény feltétel (Szett tagjai) és művelet (Kedvezmény kiosztása) együtt tartozik."
      );
    }

    const memberIds = memberIdsFromArgs(this.argumentsOf(own.condition));

    if (memberIds === undefined) {
      throw new UserInputError("A szett-kedvezmény feltételhez meg kell adni a szett tagjait.");
    }

    if (amountFromArgs(this.argumentsOf(own.action)) === null) {
      throw new UserInputError("A szett-kedvezmény pozitív egész forint lehet.");
    }

    if (input.enabled === false) {
      return;
    }

    const id = "id" in input ? String(input.id) : undefined;
    const others = await this.connection.rawConnection.getRepository(Promotion).find({
      where: { enabled: true, deletedAt: IsNull() },
      relations: { translations: true },
    });

    for (const other of others) {
      if (id !== undefined && other.id === Number(id)) {
        continue;
      }

      const otherCondition = other.conditions.find(
        (condition) => condition.code === PRODUCT_SET_CONDITION_CODE
      );

      if (otherCondition === undefined) {
        continue;
      }

      const otherIds = memberIdsFromArgs(otherCondition.args);

      if (otherIds === undefined) {
        continue;
      }

      const clash = memberIds.filter((id_) => otherIds.includes(id_));

      if (clash.length > 0) {
        throw new UserInputError(
          `A(z) „${huName(other.translations) ?? other.id}” szett-promóció már tartalmazza ezeket a ` +
            `termékeket (azonosítók: ${clash.join(", ")}). Egy termék egyszerre csak egy szett tagja lehet.`
        );
      }
    }
  }

  private ownOperations(input: CreatePromotionInput | UpdatePromotionInput): ConditionArgs {
    return {
      condition: input.conditions?.find(
        (condition) => condition.code === PRODUCT_SET_CONDITION_CODE
      ),
      action: input.actions?.find((action) => action.code === PRODUCT_SET_ACTION_CODE),
    };
  }

  private argumentsOf(
    operation: ConfigurableOperationInput
  ): ReadonlyArray<{ name: string; value: string }> {
    return operation.arguments.map((argument) => ({
      name: argument.name,
      value: argument.value,
    }));
  }
}
