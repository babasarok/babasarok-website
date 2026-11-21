import { Product, type RequestContext, type TransactionalConnection } from "@vendure/core";
import { z } from "zod";
import type { ProductSnapshot } from "./details";

const TranslationCustomFieldsSchema = z.object({
  shortDescription: z.string().nullish(),
  tagline: z.string().nullish(),
});

/** The translation custom fields, read defensively: Vendure types translation
 * custom fields loosely. */
export function customFieldsOf(customFields: unknown): {
  shortDescription: string | null;
  tagline: string | null;
} {
  const parsed = TranslationCustomFieldsSchema.safeParse(customFields);

  return parsed.success
    ? {
        shortDescription: parsed.data.shortDescription ?? null,
        tagline: parsed.data.tagline ?? null,
      }
    : { shortDescription: null, tagline: null };
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) && value !== null ? parsed : null;
}

/** The persisted product state a save is diffed against. */
export async function readSnapshot(
  connection: TransactionalConnection,
  ctx: RequestContext,
  id: number
): Promise<ProductSnapshot | null> {
  const product = await connection.getRepository(ctx, Product).findOne({
    where: { id },
    relations: { translations: true },
  });

  if (product === null) {
    return null;
  }

  const date = product.customFields.date;

  return {
    enabled: product.enabled,
    featuredAssetId: numberOrNull(product.featuredAssetId),
    iconId: numberOrNull(product.customFields.iconId),
    date: date === null ? null : date.toISOString(),
    popularityRank: numberOrNull(product.customFields.popularityRank),
    translations: product.translations.map((translation) => ({
      languageCode: translation.languageCode,
      name: translation.name,
      slug: translation.slug,
      description: translation.description,
      ...customFieldsOf(translation.customFields),
    })),
  };
}

export function huNameOf(snapshot: ProductSnapshot): string | null {
  const hu = snapshot.translations.find((translation) => translation.languageCode === "hu");

  return hu === undefined || hu.name === "" ? null : hu.name;
}
