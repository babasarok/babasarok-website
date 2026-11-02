import { Injectable } from "@nestjs/common";
import {
  Collection,
  CollectionService,
  Facet,
  FacetService,
  FacetValue,
  FacetValueService,
  InternalServerError,
  LanguageCode,
  RequestContext,
  TransactionalConnection,
} from "@vendure/core";
import {
  COLOR_FACET_CODE,
  MATERIAL_COLLECTION_SLUG_PREFIX,
  MATERIAL_FACET_CODE,
  colorFacetValueCode,
  staleColorFacetValueCodes,
} from "../product/facet-plan";
import { Material } from "./material.entity";

/** Vendure's built-in facet-value collection filter (default-collection-filters). */
const FACET_VALUE_FILTER_CODE = "facet-value-filter";

interface TranslatedName {
  languageCode: LanguageCode;
  name: string;
}

function namesOf(
  translations: Array<{ languageCode: LanguageCode; label: string }>
): TranslatedName[] {
  return translations
    .filter((translation) => translation.label !== "")
    .map((translation) => ({ languageCode: translation.languageCode, name: translation.label }));
}

function namesUpToDate(existing: TranslatedName[], desired: TranslatedName[]): boolean {
  return desired.every((name) =>
    existing.some(
      (candidate) => candidate.languageCode === name.languageCode && candidate.name === name.name
    )
  );
}

/** Facet values keyed by `<facetId>/<code>`; duplicate codes within a facet are a broken state. */
export function facetValuesByKey(values: FacetValue[]): Map<string, FacetValue> {
  const byKey = new Map<string, FacetValue>();

  for (const value of values) {
    const key = `${Number(value.facetId)}/${value.code}`;

    if (byKey.has(key)) {
      throw new InternalServerError(
        `Duplikált facet érték kód: "${value.code}" (facet azonosító: ${Number(value.facetId)}).`
      );
    }

    byKey.set(key, value);
  }

  return byKey;
}

/**
 * Keeps the two sync-owned facets (material, color) and the per-material
 * collections in step with the material rows. Runs inside the material
 * write's transaction; ids stay stable because material slugs are immutable.
 */
@Injectable()
export class MaterialFacetSync {
  constructor(
    private connection: TransactionalConnection,
    private facetService: FacetService,
    private facetValueService: FacetValueService,
    private collectionService: CollectionService
  ) {}

  async upsert(ctx: RequestContext, material: Material): Promise<void> {
    const materialFacet = await this.ensureFacet(ctx, MATERIAL_FACET_CODE, "Anyag");
    const colorFacet = await this.ensureFacet(ctx, COLOR_FACET_CODE, "Szín");
    const values = await this.connection.getRepository(ctx, FacetValue).find({
      where: [{ facet: { id: materialFacet.id } }, { facet: { id: colorFacet.id } }],
    });
    const byKey = facetValuesByKey(values);
    const materialValue = await this.upsertValue(ctx, materialFacet, byKey, {
      code: material.slug,
      names: namesOf(material.translations),
    });

    for (const color of material.colors) {
      await this.upsertValue(ctx, colorFacet, byKey, {
        code: colorFacetValueCode(material.slug, color.colorId),
        names: namesOf(color.translations),
      });
    }

    const staleColorCodes = staleColorFacetValueCodes(
      material.slug,
      material.colors.map((color) => color.colorId),
      values
        .filter((value) => Number(value.facetId) === Number(colorFacet.id))
        .map((value) => value.code)
    );

    for (const code of staleColorCodes) {
      const stale = byKey.get(`${Number(colorFacet.id)}/${code}`);

      if (stale !== undefined) {
        await this.facetValueService.delete(ctx, Number(stale.id), true);
      }
    }

    await this.upsertCollection(ctx, material, Number(materialValue.id));
  }

  async remove(ctx: RequestContext, material: Material): Promise<void> {
    const collection = await this.collectionBySlug(
      ctx,
      `${MATERIAL_COLLECTION_SLUG_PREFIX}${material.slug}`
    );

    if (collection !== null) {
      await this.collectionService.delete(ctx, collection.id);
    }

    const values = await this.connection.getRepository(ctx, FacetValue).find({
      where: [
        { facet: { code: MATERIAL_FACET_CODE }, code: material.slug },
        { facet: { code: COLOR_FACET_CODE } },
      ],
      relations: { facet: true },
    });
    const staleColorCodes = staleColorFacetValueCodes(
      material.slug,
      [],
      values.map((value) => value.code)
    );

    for (const value of values) {
      const isMaterialValue =
        value.code === material.slug && value.facet.code === MATERIAL_FACET_CODE;
      const isStaleColorValue = staleColorCodes.includes(value.code);

      if (isMaterialValue || isStaleColorValue) {
        await this.facetValueService.delete(ctx, Number(value.id), true);
      }
    }
  }

  /** Finds the facet by exact code; a mangled code (Vendure's uniquifier ran) is a broken state. */
  private async ensureFacet(ctx: RequestContext, code: string, name: string): Promise<Facet> {
    const candidates = await this.connection
      .getRepository(ctx, Facet)
      .createQueryBuilder("facet")
      .where("facet.code = :code OR facet.code LIKE :prefix", { code, prefix: `${code}-%` })
      .getMany();
    const mangled = candidates.filter(
      (facet) => facet.code !== code && /^-\d+$/.test(facet.code.slice(code.length))
    );

    if (mangled.length > 0) {
      throw new InternalServerError(
        `A(z) "${code}" facet kódja módosult vagy ütközik (${mangled
          .map((facet) => facet.code)
          .join(", ")}). A faceteket felül kell vizsgálni.`
      );
    }

    const existing = candidates.find((facet) => facet.code === code);

    if (existing !== undefined) {
      return existing;
    }

    return this.facetService.create(ctx, {
      code,
      isPrivate: false,
      translations: [{ languageCode: LanguageCode.hu, name }],
    });
  }

  private async upsertValue(
    ctx: RequestContext,
    facet: Facet,
    byKey: ReadonlyMap<string, FacetValue>,
    desired: { code: string; names: TranslatedName[] }
  ): Promise<FacetValue> {
    const existing = byKey.get(`${Number(facet.id)}/${desired.code}`);

    if (existing === undefined) {
      return this.facetValueService.create(ctx, facet, {
        code: desired.code,
        translations: desired.names,
      });
    }

    if (!namesUpToDate(existing.translations, desired.names)) {
      return this.facetValueService.update(ctx, {
        id: existing.id,
        translations: desired.names,
      });
    }

    return existing;
  }

  private async upsertCollection(
    ctx: RequestContext,
    material: Material,
    materialValueId: number
  ): Promise<void> {
    const slug = `${MATERIAL_COLLECTION_SLUG_PREFIX}${material.slug}`;
    const existing = await this.collectionBySlug(ctx, slug);

    if (existing === null) {
      await this.collectionService.create(ctx, {
        translations: namesOf(material.translations).map((name) => ({
          ...name,
          slug,
          description: "",
        })),
        filters: [
          {
            code: FACET_VALUE_FILTER_CODE,
            arguments: [
              { name: "facetValueIds", value: JSON.stringify([String(materialValueId)]) },
              { name: "containsAny", value: JSON.stringify(true) },
            ],
          },
        ],
      });
      return;
    }

    const desired = namesOf(material.translations);

    if (!namesUpToDate(existing.translations, desired)) {
      await this.collectionService.update(ctx, {
        id: existing.id,
        translations: desired.map((name) => ({ ...name, slug })),
      });
    }
  }

  private async collectionBySlug(ctx: RequestContext, slug: string): Promise<Collection | null> {
    const collections = await this.connection
      .getRepository(ctx, Collection)
      .createQueryBuilder("collection")
      .leftJoinAndSelect("collection.translations", "translation")
      .where("translation.slug = :slug", { slug })
      .getMany();

    if (collections.length > 1) {
      throw new InternalServerError(`Több "${slug}" slugú gyűjtemény létezik.`);
    }

    return collections[0] ?? null;
  }
}
