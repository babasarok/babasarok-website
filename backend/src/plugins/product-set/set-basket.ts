import { Logger } from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "../../shared/product-definition/index";
import { axisCodes, parseLineSelections, type LineSelections } from "../../shared/pricing/index";
import { materialPicks } from "./material-picks";
import { allocateSetDiscounts, type AllocationGroup, type SetInstance } from "./set-allocation";
import { lineSetStates, type LineSetState, type StateLine } from "./set-line-states";

export const PRODUCT_SET_CONDITION_CODE = "babasarok-product-set-members";
export const PRODUCT_SET_ACTION_CODE = "babasarok-product-set-discount";

/** The parts of a related-items collection the group parsing reads. */
export interface SetCollection {
  translations: ReadonlyArray<{ languageCode: string; name: string; slug: string }>;
  filters: ReadonlyArray<{
    code: string;
    args: ReadonlyArray<{ name: string; value: string }>;
  }>;
  customFields: { setDiscount: number | null };
}

/** The native product ids a collection's `product-id-filter` lists. */
export function memberIds(filters: SetCollection["filters"]): string[] | undefined {
  const filter = filters.find((operation) => operation.code === "product-id-filter");
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

/** The parsed promotion behind a set: label from the Hungarian name, members
 * and the flat amount from the condition/action args. */
export interface PromotionSource {
  id: string;
  label: string;
  /** Native product ids from the condition's `productIds` arg. */
  memberIds: readonly string[];
  /** The action's flat Ft amount; null when the promotion has no usable action. */
  amount: number | null;
}

/** The promotion fields the window filter reads. */
export interface PromotionWindow {
  deletedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  channels: ReadonlyArray<{ id: unknown }>;
  conditions: ReadonlyArray<{ code: string }>;
  actions: ReadonlyArray<{ code: string }>;
}

export interface BasketLine {
  id: unknown;
  quantity: number;
  listPrice: number;
  nativeProductId: number;
  selectionsRaw: unknown;
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

export function huName(
  translations: ReadonlyArray<{ languageCode: string; name: string }>
): string | undefined {
  return translations.find((t) => t.languageCode === "hu")?.name;
}

export function huSlug(
  translations: ReadonlyArray<{ languageCode: string; slug: string }>
): string | undefined {
  return translations.find((t) => t.languageCode === "hu")?.slug;
}

/** The member ids from the condition args' `productIds` value. */
export function memberIdsFromArgs(
  args: ReadonlyArray<{ name: string; value: string }>
): string[] | undefined {
  const raw = args.find((argument) => argument.name === "productIds")?.value;

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

/** The flat amount from the action args' `amount` value; null when unusable. */
export function amountFromArgs(
  args: ReadonlyArray<{ name: string; value: string }>
): number | null {
  const raw = args.find((argument) => argument.name === "amount")?.value;

  if (raw === undefined) {
    return null;
  }

  const amount = Number(raw);

  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

/**
 * The promotions that are live right now on the channel: not deleted, inside
 * their window and assigned to the channel.
 */
export function activePromotions<T extends PromotionWindow>(
  promotions: readonly T[],
  channelId: unknown,
  now: Date
): readonly T[] {
  return promotions.filter(
    (promotion) =>
      promotion.deletedAt === null &&
      (promotion.startsAt === null || promotion.startsAt <= now) &&
      (promotion.endsAt === null || promotion.endsAt > now) &&
      promotion.channels.some((channel) => channel.id === channelId)
  );
}

export function promotionGroups(
  promotions: readonly PromotionSource[],
  productIdByNativeId: ReadonlyMap<number, string>
): SetGroup[] {
  const groups: SetGroup[] = [];

  for (const promotion of promotions) {
    const productIds = [
      ...new Set(
        promotion.memberIds.flatMap((nativeId) => {
          const productId = productIdByNativeId.get(Number(nativeId));

          return productId === undefined ? [] : [productId];
        })
      ),
    ];
    const discount = promotion.amount;

    if (discount === null || discount <= 0 || productIds.length < 2) {
      Logger.info(
        `Szett-promóció "${promotion.label}" kihagyva: ` +
          `${discount === null || discount <= 0 ? "nincs kedvezmény" : "kevesebb mint 2 tag"}.`
      );
      continue;
    }

    groups.push({
      groupId: promotion.id,
      label: promotion.label,
      discount,
      productIds,
    });
  }

  return groups;
}

/** Native product ids whose definition rows are needed to evaluate the basket. */
export function relevantNativeProductIds(
  lines: readonly BasketLine[],
  promotions: readonly PromotionSource[]
): number[] {
  const ids = new Set<number>(lines.map((line) => line.nativeProductId));

  for (const promotion of promotions) {
    for (const nativeId of promotion.memberIds) {
      ids.add(Number(nativeId));
    }
  }

  return [...ids];
}

/** Whether any native product id sits in two promotions — the overlap the
 * save-time guard forbids; the allocation refuses rather than double-count. */
export function overlappingMemberIds(promotions: readonly PromotionSource[]): ReadonlySet<string> {
  const counts = new Map<string, number>();

  for (const promotion of promotions) {
    for (const nativeId of promotion.memberIds) {
      counts.set(nativeId, (counts.get(nativeId) ?? 0) + 1);
    }
  }

  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
}

export interface SetBasketState {
  total: number;
  instances: SetInstance[];
  lineStates: Map<string, LineSetState>;
  /** Unit prices per line — the promotion action clamps its own arg against these. */
  unitPrices: Record<string, number>;
}

const NO_SET_BASKET: SetBasketState = {
  total: 0,
  instances: [],
  lineStates: new Map(),
  unitPrices: {},
};

/**
 * The one allocation behind both the promotions and the shop API's set fields:
 * formed instances, their total and each line's set state. Empty when the
 * active promotions overlap on a product (never double-count) or when none is
 * active. The caller filters the promotion sources to the active window.
 */
export function setBasketState(input: {
  sources: readonly PromotionSource[];
  lines: readonly BasketLine[];
  definitionRows: readonly DefinitionRow[];
}): SetBasketState {
  const overlaps = overlappingMemberIds(input.sources);

  if (overlaps.size > 0) {
    Logger.error(
      `Aktív szett-promóciók ugyanazt a terméket sorolják: ${[...overlaps].join(", ")}.` +
        " Egyik sem lép érvénybe."
    );

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
      // Legacy quote-order lines (their products had no definition) carry no
      // configuration.
      continue;
    }

    let selections: LineSelections | null;

    try {
      selections = parseLineSelections(line.selectionsRaw);
    } catch {
      // An unparsable blob cannot prove colors; required colors stay unproven.
      selections = null;
    }

    const derived = axisCodes(definition, selections ?? {}, "hu");

    if (!derived.ok) {
      continue;
    }

    const picks = materialPicks(definition.fields, derived.codes, selections);

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

  const groups: AllocationGroup[] = promotionGroups(input.sources, productIdByNativeId);
  const instances = allocateSetDiscounts(lines, groups);
  const unitPrices = Object.fromEntries(lines.map((line) => [line.lineId, line.unitPrice]));

  return {
    total: instances.reduce((sum, instance) => sum + instance.amount, 0),
    instances,
    lineStates: lineSetStates(lines, groups, instances),
    unitPrices,
  };
}
