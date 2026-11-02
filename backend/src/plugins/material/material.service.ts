import { Injectable } from "@nestjs/common";
import {
  Asset,
  EventBus,
  I18nError,
  LogLevel,
  RequestContext,
  LanguageCode,
  TransactionalConnection,
  TranslatableSaver,
  TranslatedInput,
  TranslationInput,
  TranslatorService,
  UserInputError,
} from "@vendure/core";
import { In } from "typeorm";
import { z } from "zod";
import type {
  MaterialDefinition,
  ProductDefinition as CanonicalProductDefinition,
} from "@babasarok/product-definition";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import {
  Material,
  MaterialColor,
  MaterialColorTranslation,
  MaterialTranslation,
} from "./material.entity";
import { MaterialEvent } from "./material.event";
import { MaterialFacetSync } from "./material-facet-sync";
import { validateMaterialInput, type MaterialInputData } from "./material-definition";

const LanguageCodeSchema = z.enum(LanguageCode);

export function toLanguageCode(code: string): LanguageCode {
  const language = LanguageCodeSchema.safeParse(code);

  if (!language.success) {
    throw new UserInputError(`Ismeretlen nyelvkód: ${code}`);
  }

  return language.data;
}

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
 * or null when nothing references it. Products are named by their native name. */
export function materialInUseError(
  slug: string,
  definitions: Array<{ name: string; definition: CanonicalProductDefinition }>
): MaterialInUseError | null {
  const labels = definitions
    .filter(({ definition }) => materialReferenceSlugs(definition).has(slug))
    .map(({ name }) => name);

  if (labels.length === 0) {
    return null;
  }

  return new MaterialInUseError(
    `Az anyag nem törölhető, mert ezek a termékek hivatkoznak rá: ${labels.join(", ")}`
  );
}

@Injectable()
export class MaterialService {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private facetSync: MaterialFacetSync,
    private translatableSaver: TranslatableSaver,
    private translator: TranslatorService
  ) {}

  translated(ctx: RequestContext, material: Material): Material {
    return this.translator.translate(material, ctx);
  }

  translatedColor(ctx: RequestContext, color: MaterialColor): MaterialColor {
    return this.translator.translate(color, ctx);
  }

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
      const input: TranslatedInput<Material> & { slug: string; thumbnail: { id: number } | null } =
        {
          slug: definition.id,
          thumbnail: this.thumbnailRef(definition),
          translations: this.materialTranslations(definition),
        };
      const material = await this.translatableSaver.create({
        ctx: txCtx,
        entityType: Material,
        translationType: MaterialTranslation,
        input,
      });
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
      await this.replaceMaterialTranslations(txCtx, id, this.materialTranslations(definition));
      await txRepo.update({ id }, { thumbnail: this.thumbnailRef(definition) });

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
      const names = await nativeProductNames(
        this.connection,
        txCtx,
        definitions.flatMap((row) => (row.nativeProductId === null ? [] : [row.nativeProductId]))
      );
      const error = materialInUseError(
        material.slug,
        definitions.map((row) => ({
          name:
            (row.nativeProductId === null ? undefined : names.get(row.nativeProductId)) ||
            row.productId,
          definition: row.definition,
        }))
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

  private thumbnailRef(definition: MaterialDefinition): { id: number } | null {
    if (definition.thumbnail === undefined || definition.thumbnail === null) {
      return null;
    }

    return { id: Number(definition.thumbnail.assetId) };
  }

  private materialTranslations(definition: MaterialDefinition): Array<TranslationInput<Material>> {
    const languages = new Set([
      ...Object.keys(definition.label),
      ...Object.keys(definition.subtitle ?? {}),
      ...Object.keys(definition.description ?? {}),
    ]);

    return [...languages].map((language) => ({
      languageCode: toLanguageCode(language),
      label: definition.label[language] ?? "",
      subtitle: definition.subtitle?.[language] ?? "",
      description: definition.description?.[language] ?? "",
    }));
  }

  private async replaceMaterialTranslations(
    ctx: RequestContext,
    id: number,
    translations: Array<TranslationInput<Material>>
  ): Promise<void> {
    const kept = new Set(translations.map((translation) => translation.languageCode));
    const repo = this.connection.getRepository(ctx, MaterialTranslation);
    const stale = await repo.find({ where: { base: { id } } });

    for (const translation of stale) {
      if (!kept.has(translation.languageCode)) {
        await repo.delete({ id: translation.id });
      }
    }

    await this.translatableSaver.update({
      ctx,
      entityType: Material,
      translationType: MaterialTranslation,
      input: { id, translations },
    });
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
    await this.connection
      .getRepository(ctx, MaterialColor)
      .delete({ material: { id: material.id } });

    for (const [position, color] of colors.entries()) {
      const input: TranslatedInput<MaterialColor> & {
        colorId: string;
        hex: string | null;
        asset: { id: number } | null;
        material: { id: number };
        position: number;
      } = {
        colorId: color.id,
        hex: color.appearance.kind === "hex" ? color.appearance.value : null,
        asset: color.appearance.kind === "image" ? { id: Number(color.appearance.assetId) } : null,
        material: { id: Number(material.id) },
        position,
        translations: Object.entries(color.label).map(([language, label]) => ({
          languageCode: toLanguageCode(language),
          label,
        })),
      };

      await this.translatableSaver.create({
        ctx,
        entityType: MaterialColor,
        translationType: MaterialColorTranslation,
        input,
      });
    }
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
