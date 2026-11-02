import {
  Collection,
  EntityHydrator,
  LanguageCode,
  Logger,
  Promotion,
  PromotionCondition,
  PromotionOrderAction,
  TransactionalConnection,
} from "@vendure/core";
import type { Injector, Order, RequestContext } from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { parseLineSelections, type LineSelections } from "../pricing/line-selection";
import { ProductDefinition } from "../product/product.entity";
import { materialPicks } from "./material-picks";
import { allocateSetDiscounts, type AllocationLine, type SetInstance } from "./set-allocation";

/** The private parent collection whose children are the discounted sets. */
const SET_PARENT_SLUG = "szettek";
const PRODUCT_ID_FILTER_CODE = "product-id-filter";

export const PRODUCT_SET_CONDITION_CODE = "babasarok-product-set-basket";

/**
 * `extends Record<string, unknown>` satisfies Vendure's
 * `PromotionConditionState` constraint while keeping the named fields typed.
 */
export interface ProductSetConditionState extends Record<string, unknown> {
  total: number;
  instances: SetInstance[];
}

// The documented pattern for configurable operations: services captured at
// init time, used from the check/execute functions.
let connection: TransactionalConnection;
let entityHydrator: EntityHydrator;

interface SetGroup {
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

function memberIds(filters: Collection["filters"]): string[] | undefined {
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
function setGroups(
  children: Collection[],
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

/**
 * Whether exactly one active promotion uses this condition. Two copies would
 * each compute the allocation on their own and double the deduction (the
 * allocation knows nothing of promotions applied alongside); with more than
 * one the condition refuses, so neither applies.
 */
async function isTheOnlyActiveSetPromotion(ctx: RequestContext): Promise<boolean> {
  const promotions = await connection.getRepository(ctx, Promotion).find({
    where: { enabled: true },
  });
  const active = promotions.filter(
    (promotion) =>
      (promotion.endsAt === null || promotion.endsAt > new Date()) &&
      promotion.conditions.some((condition) => condition.code === PRODUCT_SET_CONDITION_CODE)
  );

  if (active.length > 1) {
    Logger.error(
      `${active.length} aktív szett-kedvezmény promóció létezik — egyik sem lép érvénybe.`
    );

    return false;
  }

  return true;
}

/**
 * Computes the basket's formed set instances (product-sets spec) from the
 * discounted-set collections under the "Szettek" parent. The returned state
 * carries the allocation into the promotion action; `false` when no instance
 * forms, so the promotion stays silent on unrelated baskets.
 */
export const productSetBasketCondition = new PromotionCondition({
  code: PRODUCT_SET_CONDITION_CODE,
  description: [
    {
      languageCode: LanguageCode.hu,
      value: "A kosár tartalmaz kompatibilis szett-tagokat, akikre a kedvezmény leosztódik.",
    },
  ],
  args: {},
  init(injector: Injector): void {
    connection = injector.get(TransactionalConnection);
    entityHydrator = injector.get(EntityHydrator);
  },
  check: async (ctx: RequestContext, order: Order): Promise<ProductSetConditionState | false> => {
    if (!(await isTheOnlyActiveSetPromotion(ctx))) {
      return false;
    }

    const parent = await connection.getRepository(ctx, Collection).findOne({
      relations: { translations: true },
      where: { translations: { slug: SET_PARENT_SLUG } },
    });

    if (parent === null) {
      return false;
    }

    const children = await connection.getRepository(ctx, Collection).find({
      where: { parentId: parent.id },
      relations: { translations: true },
    });

    await entityHydrator.hydrate(ctx, order, {
      relations: [
        "lines",
        "lines.productVariant",
        "lines.productVariant.options",
        "lines.productVariant.options.group",
      ],
    });

    const definitionRows = await connection
      .getRepository(ctx, ProductDefinition)
      .find({ select: { nativeProductId: true, definition: true } });
    const productIdByNativeId = new Map<number, string>();

    for (const row of definitionRows) {
      if (row.nativeProductId !== null) {
        productIdByNativeId.set(row.nativeProductId, row.definition.id);
      }
    }

    const definitionByProductId = new Map<string, CanonicalProductDefinition>(
      definitionRows.map((row) => [row.definition.id, row.definition])
    );

    const lines: AllocationLine[] = [];

    for (const line of order.lines) {
      const productId = productIdByNativeId.get(Number(line.productVariant.productId));
      const definition = productId === undefined ? undefined : definitionByProductId.get(productId);

      if (productId === undefined || definition === undefined) {
        // Placeholder lines (quote submissions) carry no configuration.
        continue;
      }

      let selections: LineSelections | null;

      try {
        selections = parseLineSelections(line.customFields.selections);
      } catch {
        // An unparsable blob cannot prove colors; required colors stay unproven.
        selections = null;
      }

      const optionCodesByGroup = new Map<string, string[]>();

      for (const option of line.productVariant.options) {
        const codes = optionCodesByGroup.get(option.group.code) ?? [];
        codes.push(option.code);
        optionCodesByGroup.set(option.group.code, codes);
      }

      const picks = materialPicks(definition.fields, optionCodesByGroup, selections);

      if (picks === undefined) {
        continue;
      }

      lines.push({
        lineId: String(line.id),
        productId,
        quantity: line.quantity,
        unitPrice: line.listPrice,
        materials: picks,
      });
    }

    const groups = setGroups(children, productIdByNativeId);
    const instances = allocateSetDiscounts(lines, groups);

    if (instances.length === 0) {
      return false;
    }

    return { total: instances.reduce((sum, instance) => sum + instance.amount, 0), instances };
  },
});

/**
 * Removes the allocated set discounts from the order total: the sum of the
 * formed instances' clamped amounts, computed by the basket condition.
 */
export const productSetDiscountAction = new PromotionOrderAction({
  code: "babasarok-product-set-discount",
  description: [
    { languageCode: LanguageCode.hu, value: "A képződött szett-példányok összes kedvezménye." },
  ],
  args: {},
  conditions: [productSetBasketCondition],
  execute(_ctx, _order, _args, state) {
    return -state[PRODUCT_SET_CONDITION_CODE].total;
  },
});
