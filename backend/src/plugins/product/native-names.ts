import { LanguageCode, Product } from "@vendure/core";
import type { RequestContext, TransactionalConnection } from "@vendure/core";
import { In, IsNull } from "typeorm";

export function huName(
  translations: ReadonlyArray<{ languageCode: LanguageCode; name: string }> | undefined
): string | undefined {
  return translations?.find((translation) => translation.languageCode === LanguageCode.hu)?.name;
}

/** The native products' hu names keyed by their id, in one query. */
export async function nativeProductNames(
  connection: TransactionalConnection,
  ctx: RequestContext,
  ids: readonly number[]
): Promise<Map<number, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const products = await connection.getRepository(ctx, Product).find({
    where: { id: In([...ids]), deletedAt: IsNull() },
    relations: { translations: true },
  });

  return new Map(
    products.map((product) => [Number(product.id), huName(product.translations) ?? ""])
  );
}
