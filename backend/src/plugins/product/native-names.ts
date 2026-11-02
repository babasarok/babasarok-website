import { resolveText, type LocalizedText } from "@babasarok/product-definition";
import { LanguageCode, Product } from "@vendure/core";
import type { RequestContext, TransactionalConnection } from "@vendure/core";
import { In, IsNull } from "typeorm";

export function huName(
  translations: ReadonlyArray<{ languageCode: LanguageCode; name: string }> | undefined
): string | undefined {
  return translations?.find((translation) => translation.languageCode === LanguageCode.hu)?.name;
}

/** The names of every language present, with `hu` always set (to `fallback` when missing). */
export function textOf(
  translations: ReadonlyArray<{ languageCode: LanguageCode; name: string }> | undefined,
  fallback: string
): LocalizedText {
  const text: LocalizedText = { hu: huName(translations) ?? fallback };

  for (const translation of translations ?? []) {
    if (translation.name !== "") {
      text[translation.languageCode] = translation.name;
    }
  }

  return text;
}

/** The native products' names in every language keyed by their id, in one query. */
export async function nativeProductTexts(
  connection: TransactionalConnection,
  ctx: RequestContext,
  ids: readonly number[]
): Promise<Map<number, LocalizedText>> {
  if (ids.length === 0) {
    return new Map();
  }

  const products = await connection.getRepository(ctx, Product).find({
    where: { id: In([...ids]), deletedAt: IsNull() },
    relations: { translations: true },
  });

  return new Map(products.map((product) => [Number(product.id), textOf(product.translations, "")]));
}

/** The native products' names in the request language (hu fallback) keyed by their id. */
export async function nativeProductNames(
  connection: TransactionalConnection,
  ctx: RequestContext,
  ids: readonly number[]
): Promise<Map<number, string>> {
  const texts = await nativeProductTexts(connection, ctx, ids);

  return new Map([...texts].map(([id, text]) => [id, resolveText(text, ctx.languageCode)]));
}
