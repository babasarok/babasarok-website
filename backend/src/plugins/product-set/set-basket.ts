import { Logger } from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { parseLineSelections, type LineSelections } from "@babasarok/pricing";
import { countActivePromotionsUsing, type PromotionWindow } from "./active-promotions";
import { materialPicks } from "./material-picks";
import { allocateSetDiscounts, type SetInstance } from "./set-allocation";
import { lineSetStates, type LineSetState, type StateLine } from "./set-line-states";

export const PRODUCT_SET_CONDITION_CODE = "babasarok-product-set-basket";
const PRODUCT_ID_FILTER_CODE = "product-id-filter";

/** The parts of a "Szettek" child collection the group parsing reads. */
export interface SetCollection {
  translations: ReadonlyArray<{ languageCode: string; name: string; slug: string }>;
  filters: ReadonlyArray<{
    code: string;
    args: ReadonlyArray<{ name: string; value: string }>;
  }>;
  customFields: { setDiscount: number | null };
}

export interface BasketLine {
  id: unknown;
  quantity: number;
  listPrice: number;
  nativeProductId: number;
  selectionsRaw: unknown;
  options: ReadonlyArray<{ groupCode: string; code: string }>;
}

export interface DefinitionRow {
  nativeProductId: number | null;
  definition: CanonicalProductDefinition;
}

export interface SetGroup {
  groupId: string;
  label: string;
  discount: number;
  productIds: readonly string[];
}

function huName(
  translations: ReadonlyArray<{ languageCode: string; name: string }>
): string | undefined {
  return translations.find((t) => t.languageCode === "hu")?.name;
}

function huSlug(
  translations: ReadonlyArray<{ languageCode: string; slug: string }>
): string | undefined {
  return translations.find((t) => t.languageCode === "hu")?.slug;
}

export function memberIds(filters: SetCollection["filters"]): string[] | undefined {
  const filter = filters.find((operation) => operation.code === PRODUCT_ID_FILTER_CODE);
  const raw = filter?.args.find((argument) => argument.name === "productIds")?.value;

  if (raw === undefined) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const ids: string[] = [];

  for (const id of parsed) {
    if (typeof id !== "string" && typeof id !== "number") {
      return undefined;
    }

    ids.push(String(id));
  }

  return ids;
}

/**
 * The discounted sets among the "Szettek" parent's children: members from the
 * native `product-id-filter`, label = the collection's name, discount = the
 * `setDiscount` custom field. Degenerate groups (<2 members, no/zero discount,
 * unusable filter) are ignored with a report, never thrown — a half-edited
 * collection must not break basket pricing.
 */
export function setGroups(
  children: readonly SetCollection[],
  productIdByNativeId: ReadonlyMap<number, string>
): SetGroup[] {
  const groups: SetGroup[] = [];

  for (const child of children) {
    const label = huName(child.translations);

    if (label === undefined) {
      continue;
    }

    const nativeIds = memberIds(child.filters);

    if (nativeIds === undefined) {
      Logger.warn(`Szett-gyűjtemény "${label}": nincs termék-taglistája.`);
      continue;
    }

    const productIds = new Set<string>();

    for (const nativeId of nativeIds) {
      const productId = productIdByNativeId.get(Number(nativeId));

      if (productId !== undefined) {
        productIds.add(productId);
      }
    }

    const discount = child.customFields.setDiscount;

    if (discount === null || discount <= 0 || productIds.size < 2) {
      Logger.info(
        `Szett-gyűjtemény "${label}" kihagyva: ` +
          `${discount === null || discount <= 0 ? "nincs kedvezmény" : "kevesebb mint 2 tag"}.`
      );
      continue;
    }

    const groupId = huSlug(child.translations);

    if (groupId === undefined) {
      continue;
    }

    groups.push({
      groupId,
      label,
      discount,
      productIds: [...productIds],
    });
  }

  return groups;
}

/** Native product ids whose definition rows are needed to evaluate the basket. */
export function relevantNativeProductIds(
  lines: readonly BasketLine[],
  children: readonly SetCollection[]
): number[] {
  const ids = new Set<number>(lines.map((line) => line.nativeProductId));

  for (const child of children) {
    for (const nativeId of memberIds(child.filters) ?? []) {
      ids.add(Number(nativeId));
    }
  }

  return [...ids];
}

export interface SetBasketState {
  total: number;
  instances: SetInstance[];
  lineStates: Map<string, LineSetState>;
}

const NO_SET_BASKET: SetBasketState = { total: 0, instances: [], lineStates: new Map() };

/**
 * The one allocation behind both the promotion and the shop API's set fields:
 * formed instances, their total and each line's set state. Empty when the
 * condition is not backed by exactly one active promotion (with several each
 * would deduct on its own, with none nothing is deducted).
 */
export function setBasketState(input: {
  promotions: readonly PromotionWindow[];
  channelId: unknown;
  now: Date;
  children: readonly SetCollection[];
  lines: readonly BasketLine[];
  definitionRows: readonly DefinitionRow[];
}): SetBasketState {
  const active = countActivePromotionsUsing(
    input.promotions,
    PRODUCT_SET_CONDITION_CODE,
    input.channelId,
    input.now
  );

  if (active > 1) {
    Logger.error(`${active} aktív szett-kedvezmény promóció létezik — egyik sem lép érvénybe.`);
  }

  if (active !== 1) {
    return NO_SET_BASKET;
  }

  const productIdByNativeId = new Map<number, string>();

  for (const row of input.definitionRows) {
    if (row.nativeProductId !== null) {
      productIdByNativeId.set(row.nativeProductId, row.definition.id);
    }
  }

  const definitionByProductId = new Map<string, CanonicalProductDefinition>(
    input.definitionRows.map((row) => [row.definition.id, row.definition])
  );
  const lines: StateLine[] = [];

  for (const line of input.lines) {
    const productId = productIdByNativeId.get(line.nativeProductId);
    const definition = productId === undefined ? undefined : definitionByProductId.get(productId);

    if (productId === undefined || definition === undefined) {
      // Placeholder lines (quote submissions) carry no configuration.
      continue;
    }

    let selections: LineSelections | null;

    try {
      selections = parseLineSelections(line.selectionsRaw);
    } catch {
      // An unparsable blob cannot prove colors; required colors stay unproven.
      selections = null;
    }

    const optionCodesByGroup = new Map<string, string[]>();

    for (const option of line.options) {
      const codes = optionCodesByGroup.get(option.groupCode) ?? [];
      codes.push(option.code);
      optionCodesByGroup.set(option.groupCode, codes);
    }

    const picks = materialPicks(definition.fields, optionCodesByGroup, selections);

    if (picks === undefined) {
      continue;
    }

    const materialFields = definition.fields.filter((field) => field.kind === "material");

    lines.push({
      lineId: String(line.id),
      productId,
      quantity: line.quantity,
      unitPrice: line.listPrice,
      materials: picks,
      materialFields: materialFields.map((field, index) => ({
        fieldId: field.id,
        offeredMaterialIds: field.options.map((option) => option.materialId),
        pickedMaterialId: picks[index]?.materialId ?? "",
      })),
    });
  }

  const groups = setGroups(input.children, productIdByNativeId);
  const instances = allocateSetDiscounts(lines, groups);

  return {
    total: instances.reduce((sum, instance) => sum + instance.amount, 0),
    instances,
    lineStates: lineSetStates(lines, groups, instances),
  };
}
