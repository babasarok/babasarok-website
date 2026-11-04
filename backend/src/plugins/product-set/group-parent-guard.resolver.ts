import {
  Allow,
  Collection,
  CollectionService,
  Ctx,
  Permission,
  RequestContext,
  Transaction,
  TransactionalConnection,
  UserInputError,
  type ID,
  type Translated,
} from "@vendure/core";
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import type {
  DeletionResponse,
  MoveCollectionInput,
  UpdateCollectionInput,
} from "@vendure/common/lib/generated-types";
import { groupParentViolation, type GroupParentAction } from "./group-parent-guard";

@Resolver()
export class GroupParentGuardResolver {
  constructor(
    private connection: TransactionalConnection,
    private collectionService: CollectionService
  ) {}

  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog, Permission.UpdateCollection)
  async updateCollection(
    @Ctx() ctx: RequestContext,
    @Args() args: { input: UpdateCollectionInput }
  ): Promise<Translated<Collection>> {
    const collection = await this.connection.getEntityOrThrow(ctx, Collection, args.input.id, {
      relations: { translations: true },
    });

    for (const translation of args.input.translations ?? []) {
      const stored = collection.translations.find(
        (t) => t.languageCode === translation.languageCode
      );

      if (stored === undefined || translation.slug === undefined) {
        continue;
      }

      this.assertAllowed(stored.slug, {
        type: "update-slug",
        incomingSlug: translation.slug,
      });
    }

    return this.collectionService.update(ctx, args.input);
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog, Permission.UpdateCollection)
  async moveCollection(
    @Ctx() ctx: RequestContext,
    @Args() args: { input: MoveCollectionInput }
  ): Promise<Translated<Collection>> {
    await this.assertSlugAllowed(ctx, args.input.collectionId, { type: "move" });

    return this.collectionService.move(ctx, args.input);
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.DeleteCatalog, Permission.DeleteCollection)
  async deleteCollection(
    @Ctx() ctx: RequestContext,
    @Args() args: { id: ID }
  ): Promise<DeletionResponse> {
    await this.assertSlugAllowed(ctx, args.id, { type: "delete" });

    return this.collectionService.delete(ctx, args.id);
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.DeleteCatalog, Permission.DeleteCollection)
  async deleteCollections(
    @Ctx() ctx: RequestContext,
    @Args() args: { ids: ID[] }
  ): Promise<DeletionResponse[]> {
    for (const id of args.ids) {
      await this.assertSlugAllowed(ctx, id, { type: "delete" });
    }

    return Promise.all(args.ids.map((id) => this.collectionService.delete(ctx, id)));
  }

  private async assertSlugAllowed(
    ctx: RequestContext,
    collectionId: ID,
    action: GroupParentAction
  ): Promise<void> {
    const collection = await this.connection.getEntityOrThrow(ctx, Collection, collectionId, {
      relations: { translations: true },
    });

    for (const translation of collection.translations) {
      this.assertAllowed(translation.slug, action);
    }
  }

  private assertAllowed(storedSlug: string, action: GroupParentAction): void {
    const violation = groupParentViolation(storedSlug, action);

    if (violation !== undefined) {
      throw new UserInputError(violation);
    }
  }
}
