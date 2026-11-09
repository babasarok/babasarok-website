/**
 * Deletes the translation rows of languages a sync no longer plans. Vendure's
 * TranslationDiffer and the bulk variant writer only upsert languages, so a
 * language removed from a definition or a material label would stay live in
 * the shop, and the drift check (which compares every language) would never
 * converge.
 */
import type { EntityManager } from "typeorm";

export type TranslationTable =
  | "product_variant_translation"
  | "product_option_translation"
  | "product_option_group_translation"
  | "facet_value_translation"
  | "collection_translation";

export interface KeptLanguages {
  baseId: number;
  languages: readonly string[];
}

/** One delete per distinct language set (a sync plans one or two). */
export async function pruneTranslations(
  manager: EntityManager,
  table: TranslationTable,
  kept: readonly KeptLanguages[]
): Promise<void> {
  const byLanguageSet = new Map<string, { languages: string[]; baseIds: number[] }>();

  for (const { baseId, languages } of kept) {
    const sorted = [...languages].toSorted();
    const key = sorted.join(",");
    const group = byLanguageSet.get(key);

    if (group === undefined) {
      byLanguageSet.set(key, { languages: sorted, baseIds: [baseId] });
      continue;
    }

    group.baseIds.push(baseId);
  }

  for (const { languages, baseIds } of byLanguageSet.values()) {
    await manager.query(
      `delete from "${table}" where "baseId" = any($1) and not ("languageCode" = any($2))`,
      [baseIds, languages]
    );
  }
}
