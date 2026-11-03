import {
  LineSelectionsError,
  parseLineSelections,
  referencedMaterialIds,
} from "@babasarok/pricing";
import { FacetValue, LanguageCode } from "@vendure/core";
import type { TransactionalConnection } from "@vendure/core";
import type { Order, RequestContext } from "@vendure/core";
import { In } from "typeorm";
import { Material } from "../material/material.entity";
import { THREAD_COLOR_FACET_CODE } from "../product/facet-plan";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import type { NativeLineContent } from "./order-email-view";
import { selectionDetails, type SelectionLabels } from "./selection-details";
import type { LineSelections } from "@babasarok/pricing";

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

function selectionsOf(raw: unknown): LineSelections {
  try {
    return parseLineSelections(raw);
  } catch (error) {
    if (error instanceof LineSelectionsError) {
      return {};
    }

    throw error;
  }
}

async function selectionLabels(
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

/**
 * Each order line's title and visible configuration from its `selections`
 * and the product's canonical definition, aligned with `order.lines`. The
 * order's lines must have their product variant loaded.
 */
export async function loadNativeLineContent(
  connection: TransactionalConnection,
  ctx: RequestContext,
  order: Order
): Promise<NativeLineContent[]> {
  const productIds = order.lines.map((line) => Number(line.productVariant.productId));
  const names = await nativeProductNames(connection, ctx, productIds);
  const rows = await connection
    .getRepository(ctx, ProductDefinition)
    .find({ where: { nativeProductId: In(productIds) } });
  const definitions = new Map(rows.map((row) => [row.nativeProductId, row.definition]));
  const selections = order.lines.map((line) => selectionsOf(line.customFields.selections));
  const labels = await selectionLabels(connection, ctx, selections);

  return order.lines.map((line, index) => {
    const productId = Number(line.productVariant.productId);
    const definition = definitions.get(productId);
    const title = names.get(productId) ?? line.productVariant.name;

    if (definition === undefined) {
      return { title, details: [] };
    }

    return {
      title,
      details: selectionDetails({
        definition,
        selections: selections[index],
        lengthCm: line.customFields.lengthCm ?? null,
        labels,
        languageCode: ctx.languageCode,
      }),
    };
  });
}
