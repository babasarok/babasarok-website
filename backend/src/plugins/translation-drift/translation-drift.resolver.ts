import gql from "graphql-tag";
import { Allow, Ctx, Permission, RequestContext } from "@vendure/core";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { SetTranslationInput, SetTranslationService } from "./set-translation.service";
import {
  DismissTranslationDriftInput,
  TranslationDriftList,
  TranslationDriftOptions,
  TranslationDriftService,
} from "./translation-drift.service";
import {
  TranslationGapList,
  TranslationGapOptions,
  TranslationGapService,
} from "./translation-gap.service";

@Resolver()
export class TranslationDriftResolver {
  constructor(
    private gapService: TranslationGapService,
    private driftService: TranslationDriftService,
    private setTranslationService: SetTranslationService
  ) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  translationGaps(
    @Args("options", { nullable: true }) options: TranslationGapOptions | null
  ): Promise<TranslationGapList> {
    return this.gapService.gaps(options);
  }

  @Query()
  @Allow(Permission.ReadCatalog)
  translationDrifts(
    @Args("options", { nullable: true }) options: TranslationDriftOptions | null
  ): Promise<TranslationDriftList> {
    return this.driftService.drifts(options);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  dismissTranslationDrift(
    @Ctx() ctx: RequestContext,
    @Args("input") input: DismissTranslationDriftInput
  ): Promise<boolean> {
    return this.driftService.dismiss(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  setTranslation(
    @Ctx() ctx: RequestContext,
    @Args("input") input: SetTranslationInput
  ): Promise<boolean> {
    return this.setTranslationService.setTranslation(ctx, input);
  }
}

export const translationDriftSchema = gql`
  type TranslationGap {
    entityType: String!
    entityKey: String!
    entityLabel: String!
    field: String!
    fieldLabel: String!
    huValue: String!
  }

  type TranslationGapList {
    items: [TranslationGap!]!
    totalItems: Int!
  }

  input TranslationGapOptions {
    skip: Int
    take: Int
    entityType: String
  }

  input SetTranslationInput {
    entityType: String!
    entityKey: String!
    field: String!
    languageCode: String!
    value: String!
    expectedHu: String
  }

  type TranslationDrift {
    entityType: String!
    entityKey: String!
    entityLabel: String
    field: String!
    fieldLabel: String!
    languageCode: String!
    huFrom: String
    huTo: String!
    translatedValue: String
    lastHuChangeAt: DateTime!
    auditEntryId: ID!
  }

  type TranslationDriftList {
    items: [TranslationDrift!]!
    totalItems: Int!
  }

  input TranslationDriftOptions {
    skip: Int
    take: Int
    entityType: String
  }

  input DismissTranslationDriftInput {
    entityType: String!
    entityKey: String!
    field: String!
    languageCode: String!
    auditEntryId: ID!
  }

  extend type Query {
    translationGaps(options: TranslationGapOptions): TranslationGapList!
    translationDrifts(options: TranslationDriftOptions): TranslationDriftList!
  }

  extend type Mutation {
    setTranslation(input: SetTranslationInput!): Boolean!
    dismissTranslationDrift(input: DismissTranslationDriftInput!): Boolean!
  }
`;
