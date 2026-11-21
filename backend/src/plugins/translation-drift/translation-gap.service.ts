import { Injectable } from "@nestjs/common";
import {
  Collection,
  Facet,
  LanguageCode,
  Product,
  Promotion,
  ShippingMethod,
  TransactionalConnection,
} from "@vendure/core";
import { IsNull } from "typeorm";
import { z } from "zod";
import { Material } from "../material/material.entity";
import { ProductDefinition } from "../product/product.entity";
import { definitionTextGaps, missingTranslation, type TranslationGap } from "./gaps";

export interface TranslationGapOptions {
  skip?: number | null;
  take?: number | null;
  entityType?: string | null;
}

export interface TranslationGapList {
  items: TranslationGap[];
  totalItems: number;
}

const ENTITY_ORDER: Record<string, number> = {
  product: 0,
  material: 1,
  "product-definition": 2,
  "shipping-method": 3,
  promotion: 4,
  collection: 5,
  facet: 6,
  "facet-value": 7,
};

const ProductTranslationCustomFieldsSchema = z.object({
  shortDescription: z.string().nullish(),
  tagline: z.string().nullish(),
});

/** The translation custom fields, read defensively: Vendure types translation
 * custom fields loosely on raw repository reads. */
export function productCustomFieldsOf(customFields: unknown): {
  shortDescription: string | null;
  tagline: string | null;
} {
  const parsed = ProductTranslationCustomFieldsSchema.safeParse(customFields);

  return parsed.success
    ? {
        shortDescription: parsed.data.shortDescription ?? null,
        tagline: parsed.data.tagline ?? null,
      }
    : { shortDescription: null, tagline: null };
}

export function translationOf<T extends { languageCode: LanguageCode }>(
  translations: ReadonlyArray<T>,
  languageCode: LanguageCode
): T | undefined {
  return translations.find((translation) => translation.languageCode === languageCode);
}

interface TextFieldPair {
  field: string;
  fieldLabel: string;
  hu: string | null | undefined;
  en: string | null | undefined;
}

function textRows(
  entityType: string,
  entityKey: string,
  entityLabel: string,
  fields: TextFieldPair[]
): TranslationGap[] {
  return fields
    .filter((pair) => missingTranslation(pair.hu, pair.en))
    .map((pair) => ({
      entityType,
      entityKey,
      entityLabel,
      field: pair.field,
      fieldLabel: pair.fieldLabel,
      huValue: pair.hu ?? "",
    }));
}

function productRows(products: Product[]): TranslationGap[] {
  return products.flatMap((product) => {
    const hu = translationOf(product.translations, LanguageCode.hu);
    const en = translationOf(product.translations, LanguageCode.en);
    const huCustomFields = productCustomFieldsOf(hu?.customFields);
    const enCustomFields = productCustomFieldsOf(en?.customFields);

    return textRows("product", String(product.id), hu?.name ?? `#${product.id}`, [
      { field: "name", fieldLabel: "Név", hu: hu?.name, en: en?.name },
      { field: "description", fieldLabel: "Leírás", hu: hu?.description, en: en?.description },
      {
        field: "shortDescription",
        fieldLabel: "Rövid leírás",
        hu: huCustomFields.shortDescription,
        en: enCustomFields.shortDescription,
      },
      {
        field: "tagline",
        fieldLabel: "Alcím",
        hu: huCustomFields.tagline,
        en: enCustomFields.tagline,
      },
    ]);
  });
}

@Injectable()
export class TranslationGapService {
  constructor(private connection: TransactionalConnection) {}

  async gaps(options: TranslationGapOptions | null): Promise<TranslationGapList> {
    const products = await this.connection.rawConnection.getRepository(Product).find({
      relations: { translations: true },
      where: { deletedAt: IsNull() },
    });

    const productLabels = new Map<number, string>();

    for (const product of products) {
      const hu = translationOf(product.translations, LanguageCode.hu);
      const id = Number(product.id);

      if (hu !== undefined && Number.isInteger(id)) {
        productLabels.set(id, hu.name);
      }
    }

    const [materialRows, definitionRows, shippingRows, promotionRows, collectionRows, facetRows] =
      await Promise.all([
        this.materialRows(),
        this.definitionRows(productLabels),
        this.shippingMethodRows(),
        this.promotionRows(),
        this.collectionRows(),
        this.facetRows(),
      ]);

    const rows = [
      ...productRows(products),
      ...materialRows,
      ...definitionRows,
      ...shippingRows,
      ...promotionRows,
      ...collectionRows,
      ...facetRows,
    ];

    rows.sort(
      (a, b) =>
        (ENTITY_ORDER[a.entityType] ?? Number.MAX_SAFE_INTEGER) -
          (ENTITY_ORDER[b.entityType] ?? Number.MAX_SAFE_INTEGER) ||
        a.entityLabel.localeCompare(b.entityLabel, "hu") ||
        a.field.localeCompare(b.field)
    );

    const filtered =
      typeof options?.entityType === "string" && options.entityType !== ""
        ? rows.filter((row) => row.entityType === options.entityType)
        : rows;
    const skip = Math.max(options?.skip ?? 0, 0);
    const take = Math.min(Math.max(options?.take ?? 50, 1), 100);

    return { items: filtered.slice(skip, skip + take), totalItems: filtered.length };
  }

  private async materialRows(): Promise<TranslationGap[]> {
    const materials = await this.connection.rawConnection.getRepository(Material).find();

    return materials.flatMap((material) => {
      const hu = translationOf(material.translations, LanguageCode.hu);
      const en = translationOf(material.translations, LanguageCode.en);
      const label = hu?.label ?? material.slug;

      return [
        ...textRows("material", material.slug, label, [
          { field: "label", fieldLabel: "Név", hu: hu?.label, en: en?.label },
          { field: "subtitle", fieldLabel: "Alcím", hu: hu?.subtitle, en: en?.subtitle },
          {
            field: "description",
            fieldLabel: "Leírás",
            hu: hu?.description,
            en: en?.description,
          },
        ]),
        ...material.colors.flatMap((color) => {
          const huColor = translationOf(color.translations, LanguageCode.hu);
          const enColor = translationOf(color.translations, LanguageCode.en);

          return textRows("material", material.slug, label, [
            {
              field: `colors.${color.colorId}.label`,
              fieldLabel: `Szín neve (${huColor?.label ?? color.colorId})`,
              hu: huColor?.label,
              en: enColor?.label,
            },
          ]);
        }),
      ];
    });
  }

  private async definitionRows(productLabels: Map<number, string>): Promise<TranslationGap[]> {
    const definitions = await this.connection.rawConnection.getRepository(ProductDefinition).find();

    return definitions.flatMap((row) => {
      const label =
        row.nativeProductId === null
          ? row.productId
          : (productLabels.get(row.nativeProductId) ?? row.productId);

      return definitionTextGaps(row.definition).map((gap) => ({
        entityType: "product-definition",
        entityKey: row.productId,
        entityLabel: label,
        field: gap.path,
        fieldLabel: "Definíció szöveg",
        huValue: gap.hu,
      }));
    });
  }

  private async shippingMethodRows(): Promise<TranslationGap[]> {
    const methods = await this.connection.rawConnection.getRepository(ShippingMethod).find({
      relations: { translations: true },
      where: { deletedAt: IsNull() },
    });

    return methods.flatMap((method) => {
      const hu = translationOf(method.translations, LanguageCode.hu);
      const en = translationOf(method.translations, LanguageCode.en);

      return textRows("shipping-method", method.code, hu?.name ?? method.code, [
        { field: "name", fieldLabel: "Név", hu: hu?.name, en: en?.name },
        { field: "description", fieldLabel: "Leírás", hu: hu?.description, en: en?.description },
      ]);
    });
  }

  private async promotionRows(): Promise<TranslationGap[]> {
    const promotions = await this.connection.rawConnection.getRepository(Promotion).find({
      relations: { translations: true },
      where: { deletedAt: IsNull() },
    });

    return promotions.flatMap((promotion) => {
      const hu = translationOf(promotion.translations, LanguageCode.hu);
      const en = translationOf(promotion.translations, LanguageCode.en);

      return textRows("promotion", String(promotion.id), hu?.name ?? `#${promotion.id}`, [
        { field: "name", fieldLabel: "Név", hu: hu?.name, en: en?.name },
        {
          field: "description",
          fieldLabel: "Leírás",
          hu: hu?.description,
          en: en?.description,
        },
      ]);
    });
  }

  private async collectionRows(): Promise<TranslationGap[]> {
    const collections = await this.connection.rawConnection.getRepository(Collection).find({
      relations: { translations: true },
    });

    return collections.flatMap((collection) => {
      const hu = translationOf(collection.translations, LanguageCode.hu);
      const en = translationOf(collection.translations, LanguageCode.en);

      return textRows("collection", String(collection.id), hu?.name ?? `#${collection.id}`, [
        { field: "name", fieldLabel: "Név", hu: hu?.name, en: en?.name },
        {
          field: "description",
          fieldLabel: "Leírás",
          hu: hu?.description,
          en: en?.description,
        },
      ]);
    });
  }

  private async facetRows(): Promise<TranslationGap[]> {
    const facets = await this.connection.rawConnection.getRepository(Facet).find({
      relations: { translations: true, values: { translations: true } },
    });

    return facets.flatMap((facet) => {
      const hu = translationOf(facet.translations, LanguageCode.hu);
      const en = translationOf(facet.translations, LanguageCode.en);

      return [
        ...textRows("facet", String(facet.id), hu?.name ?? facet.code, [
          { field: "name", fieldLabel: "Név", hu: hu?.name, en: en?.name },
        ]),
        ...facet.values.flatMap((value) => {
          const huValue = translationOf(value.translations, LanguageCode.hu);
          const enValue = translationOf(value.translations, LanguageCode.en);

          return textRows("facet-value", String(value.id), huValue?.name ?? value.code, [
            { field: "name", fieldLabel: "Név", hu: huValue?.name, en: enValue?.name },
          ]);
        }),
      ];
    });
  }
}
