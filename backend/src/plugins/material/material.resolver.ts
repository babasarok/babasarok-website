import gql from "graphql-tag";
import { Allow, Ctx, Permission, RequestContext } from "@vendure/core";
import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { Material, MaterialColor } from "./material.entity";
import { MaterialService } from "./material.service";
import type { MaterialInputData } from "./material-definition";

@Resolver(() => MaterialColor)
export class MaterialColorResolver {
  constructor(private materialService: MaterialService) {}

  @ResolveField(() => String)
  id(@Parent() color: MaterialColor): string {
    return color.colorId;
  }

  @ResolveField(() => String)
  label(@Ctx() ctx: RequestContext, @Parent() color: MaterialColor): string {
    return this.materialService.translatedColor(ctx, color).label;
  }
}

/** Shared by the admin and shop schemas: both expose Material with request-language text. */
@Resolver(() => Material)
export class MaterialFieldResolver {
  constructor(private materialService: MaterialService) {}

  @ResolveField(() => String)
  label(@Ctx() ctx: RequestContext, @Parent() material: Material): string {
    return this.materialService.translated(ctx, material).label;
  }

  @ResolveField(() => String)
  subtitle(@Ctx() ctx: RequestContext, @Parent() material: Material): string {
    return this.materialService.translated(ctx, material).subtitle;
  }

  @ResolveField(() => String)
  description(@Ctx() ctx: RequestContext, @Parent() material: Material): string {
    return this.materialService.translated(ctx, material).description;
  }
}

@Resolver(() => Material)
export class MaterialResolver {
  constructor(private materialService: MaterialService) {}

  @Query()
  @Allow(Permission.UpdateCatalog)
  async materials(@Ctx() ctx: RequestContext): Promise<Material[]> {
    return this.materialService.materials(ctx);
  }

  @Query()
  @Allow(Permission.UpdateCatalog)
  async material(
    @Ctx() ctx: RequestContext,
    @Args("id", { type: () => ID }) id: number
  ): Promise<Material | null> {
    return this.materialService.material(ctx, id);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async createMaterial(
    @Ctx() ctx: RequestContext,
    @Args("input") input: MaterialInputData
  ): Promise<Material> {
    return this.materialService.createMaterial(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async updateMaterial(
    @Ctx() ctx: RequestContext,
    @Args("id", { type: () => ID }) id: number,
    @Args("input") input: MaterialInputData
  ): Promise<Material> {
    return this.materialService.updateMaterial(ctx, id, input);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async deleteMaterial(
    @Ctx() ctx: RequestContext,
    @Args("id", { type: () => ID }) id: number
  ): Promise<boolean> {
    return this.materialService.deleteMaterial(ctx, id);
  }
}

@Resolver()
export class ShopMaterialResolver {
  constructor(private materialService: MaterialService) {}

  @Query()
  @Allow(Permission.Public)
  async materials(@Ctx() ctx: RequestContext): Promise<Material[]> {
    return this.materialService.materials(ctx);
  }

  @Query()
  @Allow(Permission.Public)
  async material(@Ctx() ctx: RequestContext, @Args("slug") slug: string): Promise<Material | null> {
    return this.materialService.materialBySlug(ctx, slug);
  }
}

export const shopMaterialSchema = gql`
  type MaterialColor {
    id: String!
    label: String!
    hex: String
    asset: Asset
  }

  type Material {
    id: ID!
    slug: String!
    label: String!
    subtitle: String!
    description: String!
    thumbnail: Asset
    colors: [MaterialColor!]!
  }

  extend type Query {
    material(slug: String!): Material
    materials: [Material!]!
  }
`;

export const materialSchema = gql`
  type MaterialColorTranslation {
    languageCode: LanguageCode!
    label: String!
  }

  type MaterialTranslation {
    languageCode: LanguageCode!
    label: String!
    subtitle: String!
    description: String!
  }

  type MaterialColor {
    id: String!
    label: String!
    translations: [MaterialColorTranslation!]!
    hex: String
    asset: Asset
  }

  type Material {
    id: ID!
    slug: String!
    label: String!
    subtitle: String!
    description: String!
    translations: [MaterialTranslation!]!
    thumbnail: Asset
    colors: [MaterialColor!]!
  }

  input MaterialColorTranslationInput {
    languageCode: String!
    label: String!
  }

  input MaterialTranslationInput {
    languageCode: String!
    label: String!
    subtitle: String
    description: String
  }

  input MaterialColorInput {
    id: String!
    translations: [MaterialColorTranslationInput!]!
    hex: String
    assetId: String
  }

  input MaterialInput {
    slug: String!
    translations: [MaterialTranslationInput!]!
    thumbnailAssetId: String
    colors: [MaterialColorInput!]!
  }

  extend type Query {
    material(id: ID!): Material
    materials: [Material!]!
  }

  extend type Mutation {
    createMaterial(input: MaterialInput!): Material!
    updateMaterial(id: ID!, input: MaterialInput!): Material!
    deleteMaterial(id: ID!): Boolean!
  }
`;
