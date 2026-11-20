import { ProductVariant, translateDeep } from "@vendure/core";
import type { ID, RequestContext, TransactionalConnection } from "@vendure/core";
import { In } from "typeorm";
import type { EmailDetail } from "../../shared/product-definition/index";

interface TranslatedOption {
  name: string;
  group: { id: ID; name: string };
}

/** One row per option group the variant carries, groups ordered by id ascending (the product's group order is not carried by the variant). */
export function optionDetailRows(options: ReadonlyArray<TranslatedOption>): EmailDetail[] {
  return options
    .toSorted((left, right) => Number(left.group.id) - Number(right.group.id))
    .map((option) => ({ label: option.group.name, value: option.name, depth: 0 }));
}

/**
 * The option rows of each order line's variant (ADR 0019: ready-made products
 * with native option groups), keyed by variant id. Names translate in the
 * request language with the channel default as fallback, like the shop API's
 * TranslatorService does.
 */
export async function loadVariantOptionDetails(
  connection: TransactionalConnection,
  ctx: RequestContext,
  variantIds: readonly number[]
): Promise<Map<string, EmailDetail[]>> {
  if (variantIds.length === 0) {
    return new Map();
  }

  const loaded = await connection.getRepository(ctx, ProductVariant).find({
    where: { id: In([...variantIds]) },
    relations: { options: { group: { translations: true } } },
  });

  return new Map(
    loaded.map((variant) => {
      const translated = translateDeep(
        variant,
        [ctx.languageCode, ctx.channel.defaultLanguageCode],
        ["options", ["options", "group"]]
      );

      return [String(variant.id), optionDetailRows(translated.options)];
    })
  );
}
