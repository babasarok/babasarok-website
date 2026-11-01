import gql from "graphql-tag";
import { Allow, Ctx, Permission, RequestContext } from "@vendure/core";
import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { Material, MaterialColor } from "./material.entity";
import { MaterialService } from "./material.service";
import type { MaterialInputData } from "./material-definition";

@Resolver(() => MaterialColor)
export class MaterialColorResolver {
  @ResolveField(() => String)
  id(@Parent() color: MaterialColor): string {
    return color.colorId;
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

export const materialSchema = gql`
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
    subtitle: String
    description: String
    thumbnail: Asset
    colors: [MaterialColor!]!
  }

  input MaterialColorInput {
    id: String!
    label: String!
    hex: String
    assetId: String
  }

  input MaterialInput {
    slug: String!
    label: String!
    subtitle: String
    description: String
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
