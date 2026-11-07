import { referencedMaterialIds, type LineSelections } from "../../shared/pricing/index";
import {
  LineSelectionsError,
  parseLineSelections,
  type SelectionLabels,
} from "../../shared/product-definition/index";
import { FacetValue, LanguageCode } from "@vendure/core";
import type { TransactionalConnection, RequestContext } from "@vendure/core";
import { In } from "typeorm";
import { Material } from "../material/material.entity";
import { THREAD_COLOR_FACET_CODE } from "./facet-plan";

function labelIn<T extends { languageCode: LanguageCode }>(
  translations: readonly T[],
  languageCode: LanguageCode,
  pick: (translation: T) => string,
  fallback: string
): string {
  const found =
    translations.find((translation) => translation.languageCode === languageCode) ??
    translations.find((translation) => translation.languageCode === LanguageCode.hu);

  return found === undefined ? fallback : pick(found);
}

export function selectionsOf(raw: unknown): LineSelections {
  try {
    return parseLineSelections(raw, "hu");
  } catch (error) {
    if (error instanceof LineSelectionsError) {
      return {};
    }

    throw error;
  }
}

/**
 * Label lookups for the selections referenced by the given records: material
 * labels and their colours from the Material entities, and embroidery thread
 * colours from the thread-colour facet values.
 */
export async function selectionLabels(
  connection: TransactionalConnection,
  ctx: RequestContext,
  selections: readonly LineSelections[]
): Promise<SelectionLabels> {
  const slugs = new Set(selections.flatMap((one) => referencedMaterialIds(one)));
  const colorIds = new Set(
    selections.flatMap((one) =>
      Object.values(one).flatMap((record) =>
        record?.kind === "embroidery" ? [record.colorId] : []
      )
    )
  );
  const lang = ctx.languageCode;
  const materials =
    slugs.size === 0
      ? []
      : await connection.getRepository(ctx, Material).find({ where: { slug: In([...slugs]) } });
  const threadColors =
    colorIds.size === 0
      ? []
      : await connection.getRepository(ctx, FacetValue).find({
          where: { code: In([...colorIds]), facet: { code: THREAD_COLOR_FACET_CODE } },
          relations: { translations: true },
        });

  return {
    materials: new Map(
      materials.map((material) => [
        material.slug,
        {
          label: labelIn(material.translations, lang, (t) => t.label, material.slug),
          colors: new Map(
            material.colors.map((color) => [
              color.colorId,
              labelIn(color.translations, lang, (t) => t.label, color.colorId),
            ])
          ),
        },
      ])
    ),
    threadColors: new Map(
      threadColors.map((value) => [
        value.code,
        labelIn(value.translations, lang, (t) => t.name, value.code),
      ])
    ),
  };
}
