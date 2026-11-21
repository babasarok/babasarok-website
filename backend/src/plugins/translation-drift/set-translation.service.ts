import { Injectable } from "@nestjs/common";
import {
  Collection,
  CollectionService,
  EventBus,
  Facet,
  FacetService,
  FacetValue,
  FacetValueService,
  LanguageCode,
  Product,
  ProductService,
  Promotion,
  PromotionService,
  RequestContext,
  ShippingMethod,
  ShippingMethodService,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { MaterialService, toLanguageCode } from "../material/material.service";
import type { MaterialInputData } from "../material/material-definition";
import { Material } from "../material/material.entity";
import { AuditEntryEvent, auditActor } from "../audit/audit.event";
import { productDetails } from "../audit/details";
import { huNameOf, readSnapshot } from "../audit/product-snapshot";
import { ProductDefinitionService } from "../product/product-definition.service";
import { ProductDefinition } from "../product/product.entity";
import { withEnAtPath } from "./gaps";
import { productCustomFieldsOf, translationOf } from "./translation-gap.service";

export interface SetTranslationInput {
  entityType: string;
  entityKey: string;
  field: string;
  languageCode: string;
  value: string;
  expectedHu?: string | null;
}

const HU_IS_SOURCE = "A magyar szövegek a forrásnyelvet adják; itt csak a fordítás írható.";
const EMPTY_VALUE = "A fordítás nem lehet üres.";
const NAME_FIRST = "Előbb a nevet kell lefordítani, csak utána lesz a többi mezőhöz fordítási sor.";

interface TranslationPatch {
  languageCode: LanguageCode;
  name?: string;
  slug?: string;
  description?: string;
  customFields?: { shortDescription?: string | null; tagline?: string | null };
}

function numericKey(entityKey: string): number {
  const id = Number(entityKey);

  if (!Number.isInteger(id) || id <= 0) {
    throw new UserInputError(`Érvénytelen azonosító: ${entityKey}`);
  }

  return id;
}

/** The product translation row for the patch, or null when the language row
 * does not exist yet and only the name may create it (seeded with the hu
 * slug). */
function productTranslationPatch(
  existing: { customFields: unknown } | undefined,
  language: LanguageCode,
  field: string,
  value: string,
  huSlug: string | undefined
): TranslationPatch | null {
  if (field === "shortDescription" || field === "tagline") {
    if (existing === undefined) {
      return null;
    }

    return {
      languageCode: language,
      customFields: { ...productCustomFieldsOf(existing.customFields), [field]: value },
    };
  }

  if (field !== "name" && field !== "description") {
    throw new UserInputError(`Ismeretlen termékmező: ${field}`);
  }

  if (existing !== undefined) {
    if (field === "name") {
      return { languageCode: language, name: value };
    }

    return { languageCode: language, description: value };
  }

  if (field !== "name" || huSlug === undefined) {
    return null;
  }

  return { languageCode: language, name: value, slug: huSlug, description: "" };
}

@Injectable()
export class SetTranslationService {
  constructor(
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private productService: ProductService,
    private materialService: MaterialService,
    private productDefinitionService: ProductDefinitionService,
    private shippingMethodService: ShippingMethodService,
    private promotionService: PromotionService,
    private collectionService: CollectionService,
    private facetService: FacetService,
    private facetValueService: FacetValueService
  ) {}

  async setTranslation(ctx: RequestContext, input: SetTranslationInput): Promise<boolean> {
    const language = toLanguageCode(input.languageCode);

    if (language === LanguageCode.hu) {
      throw new UserInputError(HU_IS_SOURCE);
    }

    const value = input.value.trim();

    if (value === "") {
      throw new UserInputError(EMPTY_VALUE);
    }

    switch (input.entityType) {
      case "product":
        return this.setProduct(ctx, input, language, value);
      case "material":
        return this.setMaterial(ctx, input, language, value);
      case "product-definition":
        return this.setDefinition(ctx, input, language, value);
      case "shipping-method":
        return this.setShippingMethod(ctx, input, language, value);
      case "promotion":
        return this.setPromotion(ctx, input, language, value);
      case "collection":
        return this.setCollection(ctx, input, language, value);
      case "facet":
        return this.setFacet(ctx, input, language, value);
      case "facet-value":
        return this.setFacetValue(ctx, input, language, value);
      default:
        throw new UserInputError(`Ismeretlen entitástípus: ${input.entityType}`);
    }
  }

  private async setProduct(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const id = numericKey(input.entityKey);
    const product = await this.connection.rawConnection.getRepository(Product).findOne({
      where: { id },
      relations: { translations: true },
    });

    if (product === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${id}`);
    }

    const hu = translationOf(product.translations, LanguageCode.hu);
    const patch = productTranslationPatch(
      translationOf(product.translations, language),
      language,
      input.field,
      value,
      hu?.slug
    );

    if (patch === null) {
      throw new UserInputError(NAME_FIRST);
    }

    // The stock mutation's audit interceptor only sees `updateProduct`; this
    // service path publishes its own row from the same snapshot helpers.
    const before = await readSnapshot(this.connection, ctx, id);

    await this.productService.update(ctx, { id: product.id, translations: [patch] });

    const after = await readSnapshot(this.connection, ctx, id);

    if (before !== null && after !== null) {
      await this.eventBus.publish(
        new AuditEntryEvent(ctx, {
          entityType: "product",
          entityKey: String(id),
          action: "updated",
          summary: huNameOf(after),
          details: productDetails(before, after),
          source: auditActor(ctx) === null ? "system" : "admin",
          actor: auditActor(ctx),
        })
      );
    }

    return true;
  }

  /** Material updates replace the entity wholesale (colors included), so the
   * patch carries the full stored state with only the target text changed. */
  private async setMaterial(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const material = await this.connection.rawConnection.getRepository(Material).findOne({
      where: { slug: input.entityKey },
    });

    if (material === null) {
      throw new UserInputError(`Nincs anyag ezzel az azonosítóval: ${input.entityKey}`);
    }

    const patch: MaterialInputData = {
      slug: material.slug,
      thumbnailAssetId: material.thumbnail === null ? null : String(material.thumbnail.id),
      translations: material.translations.map((translation) => ({
        languageCode: translation.languageCode,
        label: translation.label,
        subtitle: translation.subtitle,
        description: translation.description,
      })),
      colors: material.colors.map((color) => ({
        id: color.colorId,
        hex: color.hex,
        assetId: color.asset === null ? null : String(color.asset.id),
        translations: color.translations.map((translation) => ({
          languageCode: translation.languageCode,
          label: translation.label,
        })),
      })),
    };

    const languageCode: string = language;

    if (input.field === "label" || input.field === "subtitle" || input.field === "description") {
      const row = patch.translations.find(
        (translation) => translation.languageCode === languageCode
      );

      if (row === undefined) {
        if (input.field !== "label") {
          throw new UserInputError(NAME_FIRST);
        }

        patch.translations.push({
          languageCode: language,
          label: value,
          subtitle: "",
          description: "",
        });
      } else if (input.field === "label") {
        row.label = value;
      } else if (input.field === "subtitle") {
        row.subtitle = value;
      } else {
        row.description = value;
      }
    } else {
      const colorId = colorIdOf(input.field);
      const color = patch.colors.find((candidate) => candidate.id === colorId);

      if (color === undefined) {
        throw new UserInputError(`Ismeretlen anyagmező: ${input.field}`);
      }

      const row = color.translations.find(
        (translation) => translation.languageCode === languageCode
      );

      if (row === undefined) {
        color.translations.push({ languageCode: language, label: value });
      } else {
        row.label = value;
      }
    }

    await this.materialService.updateMaterial(ctx, Number(material.id), patch);

    return true;
  }

  private async setDefinition(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const row = await this.connection.rawConnection.getRepository(ProductDefinition).findOneBy({
      productId: input.entityKey,
    });

    if (row === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${input.entityKey}`);
    }

    let patched: unknown;

    try {
      patched = withEnAtPath(row.definition, input.field, language, value, input.expectedHu);
    } catch (error: unknown) {
      throw new UserInputError(error instanceof Error ? error.message : String(error));
    }

    await this.productDefinitionService.updateProductDefinition(ctx, row.productId, patched);

    return true;
  }

  private async setShippingMethod(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const method = await this.connection.rawConnection.getRepository(ShippingMethod).findOne({
      where: { code: input.entityKey },
      relations: { translations: true },
    });

    if (method === null) {
      throw new UserInputError(`Nincs szállítási mód ezzel az azonosítóval: ${input.entityKey}`);
    }

    const translation = nameOrDescriptionRow(
      translationOf(method.translations, language) !== undefined,
      language,
      input.field,
      value,
      "szállítási mód"
    );

    await this.shippingMethodService.update(ctx, {
      id: method.id,
      translations: [translation],
      customFields: { requiresAddress: method.customFields.requiresAddress },
    });

    return true;
  }

  private async setPromotion(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const id = numericKey(input.entityKey);
    const promotion = await this.connection.rawConnection.getRepository(Promotion).findOne({
      where: { id },
      relations: { translations: true },
    });

    if (promotion === null) {
      throw new UserInputError(`Nincs kedvezmény ezzel az azonosítóval: ${id}`);
    }

    const translation = nameOrDescriptionRow(
      translationOf(promotion.translations, language) !== undefined,
      language,
      input.field,
      value,
      "kedvezmény"
    );

    await this.promotionService.updatePromotion(ctx, {
      id: promotion.id,
      translations: [translation],
    });

    return true;
  }

  private async setCollection(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const id = numericKey(input.entityKey);
    const collection = await this.connection.rawConnection.getRepository(Collection).findOne({
      where: { id },
      relations: { translations: true },
    });

    if (collection === null) {
      throw new UserInputError(`Nincs gyűjtemény ezzel az azonosítóval: ${id}`);
    }

    const hu = translationOf(collection.translations, LanguageCode.hu);
    const existing = translationOf(collection.translations, language);
    const translation = nameOrDescriptionRow(
      existing !== undefined,
      language,
      input.field,
      value,
      "gyűjtemény",
      hu?.slug ?? null
    );

    await this.collectionService.update(ctx, {
      id: collection.id,
      translations: [translation],
    });

    return true;
  }

  private async setFacet(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const id = numericKey(input.entityKey);
    const facet = await this.connection.rawConnection.getRepository(Facet).findOneBy({ id });

    if (facet === null) {
      throw new UserInputError(`Nincs tulajdonság ezzel az azonosítóval: ${id}`);
    }

    await this.facetService.update(ctx, {
      id: facet.id,
      translations: [{ languageCode: language, name: value }],
    });

    return true;
  }

  private async setFacetValue(
    ctx: RequestContext,
    input: SetTranslationInput,
    language: LanguageCode,
    value: string
  ): Promise<boolean> {
    const id = numericKey(input.entityKey);
    const facetValue = await this.connection.rawConnection
      .getRepository(FacetValue)
      .findOneBy({ id });

    if (facetValue === null) {
      throw new UserInputError(`Nincs tulajdonságérték ezzel az azonosítóval: ${id}`);
    }

    await this.facetValueService.update(ctx, {
      id: facetValue.id,
      translations: [{ languageCode: language, name: value }],
    });

    return true;
  }
}

function colorIdOf(field: string): string {
  const prefix = "colors.";
  const suffix = ".label";

  if (!field.startsWith(prefix) || !field.endsWith(suffix)) {
    throw new UserInputError(`Ismeretlen anyagmező: ${field}`);
  }

  return field.slice(prefix.length, field.length - suffix.length);
}

/** The name/description translation row for the simple translatable entities,
 * throwing on unknown fields and enforcing the name-first row creation. The
 * created row seeds its description; `slugSeed` is the hu slug when the
 * entity is slugged (null when its hu row is missing), and undefined for
 * entities without a slug. */
function nameOrDescriptionRow(
  rowExists: boolean,
  language: LanguageCode,
  field: string,
  value: string,
  entityTypeLabel: string,
  slugSeed?: string | null
): { languageCode: LanguageCode; name?: string; slug?: string; description?: string } {
  if (field !== "name" && field !== "description") {
    throw new UserInputError(`Ismeretlen ${entityTypeLabel}mező: ${field}`);
  }

  if (field === "name" && rowExists) {
    return { languageCode: language, name: value };
  }

  if (field === "name") {
    if (slugSeed === null) {
      throw new UserInputError(NAME_FIRST);
    }

    if (slugSeed === undefined) {
      return { languageCode: language, name: value, description: "" };
    }

    return { languageCode: language, name: value, slug: slugSeed, description: "" };
  }

  if (rowExists) {
    return { languageCode: language, description: value };
  }

  throw new UserInputError(NAME_FIRST);
}
