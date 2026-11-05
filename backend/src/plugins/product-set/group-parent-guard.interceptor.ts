import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { Collection, TransactionalConnection, UserInputError, type ID } from "@vendure/core";
import type {
  MoveCollectionInput,
  UpdateCollectionInput,
} from "@vendure/common/lib/generated-types";
import type { Observable } from "rxjs";
import {
  groupParentViolation,
  updateSlugViolation,
  type GroupParentAction,
} from "./group-parent-guard";

const GUARDED_MUTATIONS = new Set([
  "updateCollection",
  "moveCollection",
  "deleteCollection",
  "deleteCollections",
]);

type GuardedArgs = {
  input?: UpdateCollectionInput | MoveCollectionInput;
  id?: ID;
  ids?: ID[];
};

@Injectable()
export class GroupParentGuardInterceptor implements NestInterceptor {
  constructor(private connection: TransactionalConnection) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<
      { fieldName: string; parentType: { name: string } } | undefined
    >();

    if (info?.parentType.name !== "Mutation" || !GUARDED_MUTATIONS.has(info.fieldName)) {
      return next.handle();
    }

    const violation = await this.violation(info.fieldName, gqlContext.getArgs<GuardedArgs>());

    if (violation !== undefined) {
      throw new UserInputError(violation);
    }

    return next.handle();
  }

  private async violation(fieldName: string, args: GuardedArgs): Promise<string | undefined> {
    switch (fieldName) {
      case "updateCollection":
        return this.updateViolation(args);
      case "moveCollection": {
        const input = args.input;

        if (input === undefined || !("collectionId" in input)) {
          return undefined;
        }

        return this.slugViolation(input.collectionId, { type: "move" });
      }
      case "deleteCollection":
        return this.slugViolation(args.id, { type: "delete" });
      case "deleteCollections": {
        for (const id of args.ids ?? []) {
          const violation = await this.slugViolation(id, { type: "delete" });

          if (violation !== undefined) {
            return violation;
          }
        }

        return undefined;
      }
      default:
        return undefined;
    }
  }

  private async updateViolation(args: GuardedArgs): Promise<string | undefined> {
    const input = args.input;

    if (input === undefined || !("id" in input)) {
      return undefined;
    }

    const collection = await this.loadCollection(input.id);

    if (collection === null) {
      return undefined;
    }

    return updateSlugViolation(collection.translations, input.translations ?? []);
  }

  private async slugViolation(
    id: ID | undefined,
    action: GroupParentAction
  ): Promise<string | undefined> {
    if (id === undefined) {
      return undefined;
    }

    const collection = await this.loadCollection(id);

    if (collection === null) {
      return undefined;
    }

    for (const translation of collection.translations) {
      const violation = groupParentViolation(translation.slug, action);

      if (violation !== undefined) {
        return violation;
      }
    }

    return undefined;
  }

  private loadCollection(id: ID): Promise<Collection | null> {
    return this.connection.rawConnection.getRepository(Collection).findOne({
      where: { id: Number(id) },
      relations: { translations: true },
    });
  }
}
