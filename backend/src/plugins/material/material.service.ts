import { Injectable } from "@nestjs/common";
import {
  Asset,
  EventBus,
  I18nError,
  LogLevel,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { In } from "typeorm";
import type {
  MaterialDefinition,
  ProductDefinition as CanonicalProductDefinition,
} from "@babasarok/product-definition";
import { ProductDefinition } from "../product/product.entity";
import { Material, MaterialColor } from "./material.entity";
import { MaterialEvent } from "./material.event";
import { MaterialFacetSync } from "./material-facet-sync";
import { validateMaterialInput, type MaterialInputData } from "./material-definition";

/** Deletion refusal with a machine-readable code: the dashboard keys its
 * error handling off `extensions.code`, not the message text. */
class MaterialInUseError extends I18nError {
  constructor(message: string) {
    super(message, {}, "MATERIAL_IN_USE", LogLevel.Warn);
  }
}

/** The material slugs a product definition references: material-field options
 * and forbidden combinations. */
export function materialReferenceSlugs(definition: CanonicalProductDefinition): Set<string> {
  const slugs = new Set<string>();

  for (const field of definition.fields) {
    if (field.kind === "material") {
      for (const option of field.options) {
        slugs.add(option.materialId);
      }
    }
  }

  for (const combination of definition.forbiddenMaterialCombinations) {
    for (const slug of combination) {
      slugs.add(slug);
    }
  }

  return slugs;
}

/** The refusal for deleting a material referenced by the given definitions,
 * or null when nothing references it. */
export function materialInUseError(
  slug: string,
  definitions: CanonicalProductDefinition[]
): MaterialInUseError | null {
  const labels = definitions
    .filter((definition) => materialReferenceSlugs(definition).has(slug))
    .map((definition) => definition.label);

  if (labels.length === 0) {
    return null;
  }

  return new MaterialInUseError(
    `Az anyag nem törölhető, mert ezek a termékdefiníciók hivatkoznak rá: ${labels.join(", ")}`
  );
}

@Injectable()
export class MaterialService {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private facetSync: MaterialFacetSync
  ) {}

  async materials(ctx: RequestContext): Promise<Material[]> {
    const materials = await this.connection.getRepository(ctx, Material).find({
      order: { slug: "ASC" },
    });

    return materials.map((material) => this.sortColors(material));
  }

  async material(ctx: RequestContext, id: number): Promise<Material | null> {
    const material = await this.connection.getRepository(ctx, Material).findOneBy({ id });

    if (material === null) {
      return null;
    }

    return this.sortColors(material);
  }

  async createMaterial(ctx: RequestContext, input: MaterialInputData): Promise<Material> {
    const definition = await this.validated(input, ctx);
    const repo = this.connection.getRepository(ctx, Material);

    if ((await repo.findOneBy({ slug: definition.id })) !== null) {
      throw new UserInputError(`Már létezik anyag ezzel az azonosítóval: ${definition.id}`);
    }

    const material = await this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, Material);
      await txRepo.insert({
        slug: definition.id,
        label: definition.label,
        ...this.contentValues(definition),
      });

      const material = await txRepo.findOneByOrFail({ slug: definition.id });
      await this.replaceColors(txCtx, material, definition.colors);
      const updated = await txRepo.findOneByOrFail({ slug: definition.id });
      await this.facetSync.upsert(txCtx, updated);

      return updated;
    });

    await this.eventBus.publish(new MaterialEvent(ctx, "created", material.slug));
    return material;
  }

  async updateMaterial(
    ctx: RequestContext,
    id: number,
    input: MaterialInputData
  ): Promise<Material> {
    const repo = this.connection.getRepository(ctx, Material);
    const existing = await repo.findOneBy({ id });

    if (existing === null) {
      throw new UserInputError(`Nincs anyag ezzel az azonosítóval: ${id}`);
    }

    if (input.slug !== existing.slug) {
      throw new UserInputError("Az anyag azonosítója nem módosítható.");
    }

    const definition = await this.validated(input, ctx);

    const material = await this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, Material);
      await txRepo.update({ id }, { label: definition.label, ...this.contentValues(definition) });

      const material = await txRepo.findOneByOrFail({ id });
      await this.replaceColors(txCtx, material, definition.colors);
      const updated = await txRepo.findOneByOrFail({ id });
      await this.facetSync.upsert(txCtx, updated);

      return updated;
    });

    await this.eventBus.publish(new MaterialEvent(ctx, "updated", material.slug));
    return material;
  }

  async deleteMaterial(ctx: RequestContext, id: number): Promise<boolean> {
    const repo = this.connection.getRepository(ctx, Material);
    const material = await repo.findOneBy({ id });

    if (material === null) {
      throw new UserInputError(`Nincs anyag ezzel az azonosítóval: ${id}`);
    }

    await this.connection.withTransaction(ctx, async (txCtx) => {
      const definitions = await this.connection.getRepository(txCtx, ProductDefinition).find();
      const error = materialInUseError(
        material.slug,
        definitions.map((definition) => definition.definition)
      );

      if (error !== null) {
        throw error;
      }

      await this.facetSync.remove(txCtx, material);
      await this.connection.getRepository(txCtx, Material).delete({ id });
    });

    await this.eventBus.publish(new MaterialEvent(ctx, "deleted", material.slug));
    return true;
  }

  /**
   * Idempotent convergence for databases predating the facet sync: brings
   * every material's facet values and auto-managed collection up to date and
   * re-syncs every product referencing a material. Re-run safe.
   */
  async convergeFacets(ctx: RequestContext): Promise<number> {
    const materials = await this.connection.getRepository(ctx, Material).find();

    for (const material of materials) {
      await this.facetSync.upsert(ctx, material);
      await this.eventBus.publish(new MaterialEvent(ctx, "updated", material.slug));
    }

    return materials.length;
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
