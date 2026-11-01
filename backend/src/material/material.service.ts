import { Injectable } from "@nestjs/common";
import { Asset, RequestContext, TransactionalConnection, UserInputError } from "@vendure/core";
import { In } from "typeorm";
import type { MaterialDefinition } from "@babasarok/product-definition";
import { Material, MaterialColor } from "./material.entity";
import { validateMaterialInput, type MaterialInputData } from "./material-definition";

@Injectable()
export class MaterialService {
  constructor(private connection: TransactionalConnection) {}

  async materials(ctx: RequestContext): Promise<Material[]> {
    const materials = await this.connection.getRepository(ctx, Material).find({
      order: { id: "ASC" },
    });

    return materials.map((material) => this.sortColors(material));
  }

  async material(ctx: RequestContext, id: string): Promise<Material | null> {
    const material = await this.connection.getRepository(ctx, Material).findOneBy({ id });

    if (material === null) {
      return null;
    }

    return this.sortColors(material);
  }

  async createMaterial(ctx: RequestContext, input: MaterialInputData): Promise<Material> {
    const definition = await this.validated(input, ctx);
    const repo = this.connection.getRepository(ctx, Material);

    if ((await repo.findOneBy({ id: input.id })) !== null) {
      throw new UserInputError(`Már létezik anyag ezzel az azonosítóval: ${input.id}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, Material);
      await txRepo.insert({
        id: definition.id,
        label: definition.label,
        ...this.contentValues(definition),
      });

      const material = await txRepo.findOneByOrFail({ id: definition.id });
      await this.replaceColors(txCtx, material, definition.colors);

      return txRepo.findOneByOrFail({ id: definition.id });
    });
  }

  async updateMaterial(
    ctx: RequestContext,
    id: string,
    input: MaterialInputData
  ): Promise<Material> {
    if (input.id !== id) {
      throw new UserInputError("Az anyag azonosítója nem módosítható.");
    }

    const definition = await this.validated(input, ctx);
    const repo = this.connection.getRepository(ctx, Material);

    if ((await repo.findOneBy({ id })) === null) {
      throw new UserInputError(`Nincs anyag ezzel az azonosítóval: ${id}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, Material);
      await txRepo.update({ id }, { label: definition.label, ...this.contentValues(definition) });

      const material = await txRepo.findOneByOrFail({ id });
      await this.replaceColors(txCtx, material, definition.colors);

      return txRepo.findOneByOrFail({ id });
    });
  }

  async deleteMaterial(ctx: RequestContext, id: string): Promise<boolean> {
    const repo = this.connection.getRepository(ctx, Material);

    if ((await repo.findOneBy({ id })) === null) {
      throw new UserInputError(`Nincs anyag ezzel az azonosítóval: ${id}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      await this.connection.getRepository(txCtx, Material).delete({ id });
      return true;
    });
  }

  private contentValues(definition: MaterialDefinition): {
    subtitle: string | null;
    description: string | null;
    thumbnail: { id: number } | null;
  } {
    return {
      subtitle: definition.subtitle ?? null,
      description: definition.description ?? null,
      thumbnail:
        definition.thumbnail === undefined || definition.thumbnail === null
          ? null
          : { id: Number(definition.thumbnail.assetId) },
    };
  }

  private sortColors(material: Material): Material {
    material.colors.sort((a, b) => a.position - b.position);
    return material;
  }

  private async replaceColors(
    ctx: RequestContext,
    material: Material,
    colors: MaterialDefinition["colors"]
  ): Promise<void> {
    const colorRepo = this.connection.getRepository(ctx, MaterialColor);
    await colorRepo.delete({ material: { id: material.id } });

    if (colors.length === 0) {
      return;
    }

    await colorRepo.insert(
      colors.map((color, position) => ({
        colorId: color.id,
        label: color.label,
        hex: color.appearance.kind === "hex" ? color.appearance.value : null,
        asset: color.appearance.kind === "image" ? { id: Number(color.appearance.assetId) } : null,
        material: { id: material.id },
        position,
      }))
    );
  }

  private async validated(
    input: MaterialInputData,
    ctx: RequestContext
  ): Promise<MaterialDefinition> {
    const existingAssetIds = new Set<number>();

    const requestedAssetIds = [
      ...input.colors.map((color) => color.assetId),
      input.thumbnailAssetId,
    ]
      .filter(
        (assetId): assetId is string => assetId !== null && assetId !== undefined && assetId !== ""
      )
      .map(Number)
      .filter((assetId) => Number.isInteger(assetId) && assetId > 0);

    if (requestedAssetIds.length > 0) {
      const assets = await this.connection
        .getRepository(ctx, Asset)
        .find({ where: { id: In(requestedAssetIds) } });

      for (const asset of assets) {
        existingAssetIds.add(Number(asset.id));
      }
    }

    const result = validateMaterialInput(input, existingAssetIds);

    if (!result.success) {
      throw new UserInputError(result.errors.join("\n"));
    }

    return result.definition;
  }
}
