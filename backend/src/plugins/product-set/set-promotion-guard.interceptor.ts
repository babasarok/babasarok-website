import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import {
  EventBus,
  internal_getRequestContext,
  LanguageCode,
  Logger,
  Product,
  Promotion,
  TransactionalConnection,
  UserInputError,
  type RequestContext,
} from "@vendure/core";
import { In, IsNull } from "typeorm";
import type {
  CreatePromotionInput,
  ConfigurableOperationInput,
  UpdatePromotionInput,
} from "@vendure/common/lib/generated-types";
import { switchMap, tap, type Observable } from "rxjs";
import { z } from "zod";
import { canonicalJson, byCodeUnit } from "../../shared/product-definition/index";
import {
  huName,
  memberIdsFromArgs,
  amountFromArgs,
  PRODUCT_SET_ACTION_CODE,
  PRODUCT_SET_CONDITION_CODE,
} from "./set-basket";
import { AuditEntryEvent, auditActor } from "../audit/audit.event";
import type { AuditDetail } from "../audit/details";

const GUARDED_MUTATIONS = new Set(["createPromotion", "updatePromotion"]);

type GuardedArgs = { input?: CreatePromotionInput | UpdatePromotionInput };

const SavedPromotionSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  translations: z.array(z.object({ languageCode: z.string(), name: z.string() })).default([]),
});

/** The promotion's set membership, amount and state before the save. */
interface PriorPromotion {
  enabled: boolean;
  huName: string | null;
  memberIds: string[] | null;
  amount: number | null;
}

function membersChanged(
  before: ReadonlyArray<string> | null,
  after: ReadonlyArray<string> | null
): boolean {
  return (
    canonicalJson((before ?? []).toSorted(byCodeUnit)) !==
    canonicalJson((after ?? []).toSorted(byCodeUnit))
  );
}

function memberText(
  ids: ReadonlyArray<string> | null,
  names: ReadonlyMap<string, string>
): string | null {
  if (ids === null) {
    return null;
  }

  return ids.map((id) => names.get(id) ?? id).join(", ");
}

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
    const prior = action === "updated" && "id" in input ? await this.prior(ctx, input.id) : null;

    return handle.pipe(
      switchMap((result: unknown) => Promise.resolve(result)),
      tap((result: unknown) => {
        const saved = SavedPromotionSchema.safeParse(result);

        if (!saved.success) {
          return;
        }

        void this.publishAudit(ctx, action, saved.data, prior);
      })
    );
  }
  /** The promotion's state before the save, read on the request's transaction
   * connection (the save has not run yet). */
  private async prior(ctx: RequestContext, id: string | number): Promise<PriorPromotion | null> {
    const promotion = await this.connection.getRepository(ctx, Promotion).findOne({
      where: { id: Number(id) },
      relations: { translations: true },
    });

    if (promotion === null) {
      return null;
    }

    const condition = promotion.conditions.find((c) => c.code === PRODUCT_SET_CONDITION_CODE);
    const action = promotion.actions.find((a) => a.code === PRODUCT_SET_ACTION_CODE);

    return {
      enabled: promotion.enabled,
      huName: huName(promotion.translations) ?? null,
      memberIds: condition === undefined ? null : (memberIdsFromArgs(condition.args) ?? null),
      amount: action === undefined ? null : amountFromArgs(action.args),
    };
  }

  /** One row per saved set promotion; updates carry the field-level details. */
  private async publishAudit(
    ctx: RequestContext,
    action: "created" | "updated",
    saved: z.output<typeof SavedPromotionSchema>,
    prior: PriorPromotion | null
  ): Promise<void> {
    try {
      const current = await this.current(ctx, Number(saved.id));
      const summary = huName(current.translations) ?? saved.name ?? null;

      await this.eventBus.publish(
        new AuditEntryEvent(ctx, {
          entityType: "promotion",
          entityKey: String(saved.id),
          action,
          summary,
          details: prior === null ? null : await this.details(ctx, prior, current),
          source: "admin",
          actor: auditActor(ctx),
        })
      );
    } catch (error: unknown) {
      Logger.error(
        `A szett-promóció változásnapló-bejegyzésének előállítása sikertelen ` +
          `(${String(saved.id)}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /** The saved promotion, read on the request's transaction connection so the
   * diff sees the save this response is about to report. */
  private async current(ctx: RequestContext, id: number): Promise<Promotion> {
    const promotion = await this.connection.getRepository(ctx, Promotion).findOne({
      where: { id },
      relations: { translations: true },
    });

    if (promotion === null) {
      throw new Error(`A mentett szett-promóció nem található: ${id}`);
    }

    return promotion;
  }

  private async details(
    ctx: RequestContext,
    prior: PriorPromotion,
    current: Promotion
  ): Promise<AuditDetail[]> {
    const condition = current.conditions.find((c) => c.code === PRODUCT_SET_CONDITION_CODE);
    const action = current.actions.find((a) => a.code === PRODUCT_SET_ACTION_CODE);
    const memberIds = condition === undefined ? null : (memberIdsFromArgs(condition.args) ?? null);
    const amount = action === undefined ? null : amountFromArgs(action.args);
    const name = huName(current.translations) ?? null;
    const details: AuditDetail[] = [];

    if (name !== prior.huName) {
      details.push({ field: "Név", from: prior.huName, to: name });
    }

    if (current.enabled !== prior.enabled) {
      details.push({
        field: "Engedélyezve",
        from: prior.enabled ? "igen" : "nem",
        to: current.enabled ? "igen" : "nem",
      });
    }

    if (membersChanged(prior.memberIds, memberIds)) {
      const names = await this.memberNames(ctx, [...(prior.memberIds ?? []), ...(memberIds ?? [])]);

      details.push({
        field: "Szett tagjai",
        from: memberText(prior.memberIds, names),
        to: memberText(memberIds, names),
      });
    }

    if (amount !== prior.amount) {
      details.push({
        field: "Kedvezmény összege",
        from: prior.amount === null ? null : `${prior.amount} Ft`,
        to: amount === null ? null : `${amount} Ft`,
      });
    }

    return details;
  }

  /** The members' product names, keyed by native product id. */
  private async memberNames(
    ctx: RequestContext,
    ids: ReadonlyArray<string>
  ): Promise<Map<string, string>> {
    const numeric = ids.map(Number).filter((id) => Number.isInteger(id));

    if (numeric.length === 0) {
      return new Map();
    }

    const products = await this.connection.getRepository(ctx, Product).find({
      where: { id: In(numeric) },
      relations: { translations: true },
    });
    const names = new Map<string, string>();

    for (const product of products) {
      const hu = product.translations.find((t) => t.languageCode === LanguageCode.hu);

      names.set(String(product.id), hu?.name ?? String(product.id));
    }

    return names;
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
