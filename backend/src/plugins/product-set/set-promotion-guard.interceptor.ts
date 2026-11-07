import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { Promotion, TransactionalConnection, UserInputError } from "@vendure/core";
import { IsNull } from "typeorm";
import type {
  CreatePromotionInput,
  ConfigurableOperationInput,
  UpdatePromotionInput,
} from "@vendure/common/lib/generated-types";
import type { Observable } from "rxjs";
import {
  huName,
  memberIdsFromArgs,
  amountFromArgs,
  PRODUCT_SET_ACTION_CODE,
  PRODUCT_SET_CONDITION_CODE,
} from "./set-basket";

const GUARDED_MUTATIONS = new Set(["createPromotion", "updatePromotion"]);

type GuardedArgs = { input?: CreatePromotionInput | UpdatePromotionInput };

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
  constructor(private connection: TransactionalConnection) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<
      { fieldName: string; parentType: { name: string } } | undefined
    >();

    if (info?.parentType.name !== "Mutation" || !GUARDED_MUTATIONS.has(info.fieldName)) {
      return next.handle();
    }

    await this.violation(info.fieldName, gqlContext.getArgs<GuardedArgs>());

    return next.handle();
  }

  private async violation(mutation: string, args: GuardedArgs): Promise<void> {
    const input = args.input;

    if (input === undefined) {
      return;
    }

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
