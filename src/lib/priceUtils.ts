import type { IProduct, Field, CmsProductMaterial } from "./types.svelte";
import type { ProductMaterialValue } from "./types.svelte";
import { isFieldVisible } from "./fieldVisibility";
import { findFieldByName, resolveNumericValue } from "./fieldValue";

interface PricePart {
  label: string;
  price: number | undefined;
}

interface DiscountInfo {
  discount: number;
  discountSource: "set" | "standalone";
  discountAppliedCount: number;
  /** Raw discount percent (e.g. 15 for 15%), independent of the applied count. */
  percent: number;
}

interface BasePrice {
  basePrice: PricePart;
  options: PricePart[];
  unitPrice: number | undefined;
  totalPrice: number | undefined;
  indeterminate: boolean;
  discountInfo: DiscountInfo | undefined;
}

/** Minimal structural shape of a product group, to avoid a data.ts import cycle. */
export interface SetDiscountGroup {
  title: string;
  discount_percent?: number | undefined;
  products: { product_id: string }[];
}

/**
 * The best set discount a product qualifies for: the largest set percent across
 * every set the product belongs to. When a product is in more than one set, the
 * biggest discount wins (no stacking). See the `product-sets` spec in
 * `openspec/`.
 */
export function resolveSetDiscount(
  productId: string,
  groups: SetDiscountGroup[]
): { percent: number; setTitle: string } | undefined {
  let best: { percent: number; setTitle: string } | undefined;
  for (const group of groups) {
    const percent = group.discount_percent;
    if (percent == null || !group.products.some((m) => m.product_id === productId)) {
      continue;
    }
    if (!best || percent > best.percent) {
      best = { percent, setTitle: group.title };
    }
  }
  return best;
}

/** Normalised, order-independent view of a product's selected material values. */
function normalizeMaterialValues(product: IProduct): string {
  const values = product.materials.values
    .filter((v): v is ProductMaterialValue => v != null && v.material_id !== "")
    .map((v) => ({
      material_id: v.material_id,
      colors: v.colors.toSorted(),
      custom_color: v.custom_color ?? "",
    }))
    .toSorted((a, b) => a.material_id.localeCompare(b.material_id));
  return JSON.stringify(values);
}

/**
 * Two products count towards the same set only when their selected material
 * values match exactly (same materials, colours and custom colours). The
 * comparison is order-independent and ignores transient `error` fields. Two
 * products with no material selections match trivially. See the `product-sets`
 * spec in `openspec/`.
 */
export function materialsMatch(a: IProduct, b: IProduct): boolean {
  return normalizeMaterialValues(a) === normalizeMaterialValues(b);
}

/**
 * The set discount an item actively earns given the current basket: its percent,
 * the winning set's title, and how many of the item's units it covers.
 */
export type ActiveDiscountStatus = {
  state: "active";
  percent: number;
  setTitle: string;
  count: number;
};
/**
 * The state of an item's best set discount relative to the current basket, for
 * surfacing in the UI: `active` when earned, `pending-partner` when no matching
 * set sibling is left in the basket (none present yet, or all matching units
 * are already allocated to other lines), `pending-material` when a sibling is
 * present but its materials differ (with `canSync` when a one-click material
 * match is possible). An active discount always wins; otherwise the biggest
 * potential discount is reported. `undefined` when the item earns no set
 * discount at all.
 */
export type SetDiscountStatus =
  | ActiveDiscountStatus
  | { state: "pending-partner"; percent: number; setTitle: string; count: number }
  | {
      state: "pending-material";
      percent: number;
      setTitle: string;
      partnerUuid: string;
      canSync: boolean;
      count: number;
    };

/**
 * Whether copying `partner`'s selected materials onto `item` could produce a
 * matching selection: the two must need the same number of materials and every
 * material `partner` picked must be available on `item`. Used to decide whether
 * to offer a one-click "match materials" action.
 */
export function canSyncMaterials(item: IProduct, partner: IProduct): boolean {
  if (item.materials.material_required_count !== partner.materials.material_required_count) {
    return false;
  }
  const available = new Set(
    item.materials.materials
      .map((m) => m?.material_path.material_id)
      .filter((id): id is string => id != null)
  );
  return partner.materials.values.every(
    (v) => v == null || v.material_id === "" || available.has(v.material_id)
  );
}

interface SetLine {
  index: number;
  item: IProduct;
  setTitle: string;
  materialKey: string;
}

/**
 * Resolves the set discount of every basket item in one global pass. Set units
 * are allocated across the whole basket: one set consumes one unit of two
 * members of *different* products whose material values match, and each basket
 * unit is consumed at most once, so a partner line can cover no more sets than
 * it has units (two babafészek lines + one babatakaro line form one set, not
 * two). An item earns its set's percent for the units it is assigned to (the
 * biggest set percent wins when a product is in several sets); an unassigned
 * item reports its pending state instead. See the `product-sets` spec in
 * `openspec/`.
 */
export function allocateSetDiscounts(
  basket: IProduct[],
  groups: SetDiscountGroup[]
): Map<string, SetDiscountStatus> {
  const active = new Map<string, { percent: number; setTitle: string; count: number }>();
  const pending = new Map<string, SetDiscountStatus>();

  for (const group of groups) {
    const percent = group.discount_percent;
    if (percent == null) {
      continue;
    }
    const memberIds = new Set(group.products.map((m) => m.product_id));
    const lines = basket.flatMap((item, index): SetLine[] =>
      memberIds.has(item.product_id)
        ? [
            {
              index,
              item,
              setTitle: group.title,
              materialKey: normalizeMaterialValues(item),
            },
          ]
        : []
    );
    if (lines.length === 0) {
      continue;
    }

    // Lines only pair with lines of identical material values.
    const pools = new Map<string, SetLine[]>();
    for (const line of lines) {
      const pool = pools.get(line.materialKey) ?? [];
      pool.push(line);
      pools.set(line.materialKey, pool);
    }

    const allocated = new Map<string, number>();
    for (const pool of pools.values()) {
      allocatePool(pool, allocated);
    }

    for (const line of lines) {
      const { item, setTitle } = line;
      const pendingBefore = pending.get(item.uuid);
      if (!pendingBefore || percent > pendingBefore.percent) {
        pending.set(item.uuid, pendingStatus(line, basket, memberIds, percent));
      }
      const count = allocated.get(item.uuid) ?? 0;
      const activeBefore = active.get(item.uuid);
      if (count > 0 && (!activeBefore || percent > activeBefore.percent)) {
        active.set(item.uuid, { percent, setTitle, count });
      }
    }
  }

  const statuses = new Map<string, SetDiscountStatus>();
  for (const item of basket) {
    const earned = active.get(item.uuid);
    const status = earned ? { state: "active" as const, ...earned } : pending.get(item.uuid);
    if (status) {
      statuses.set(item.uuid, status);
    }
  }
  return statuses;
}

/**
 * The pending state an item reports in a group it earns no discount from:
 * `pending-partner` when no sibling with matching materials is in the basket
 * (including when all matching units are already allocated to other lines, in
 * which case adding more of the set is the fix), `pending-material` otherwise.
 */
function pendingStatus(
  line: SetLine,
  basket: IProduct[],
  memberIds: Set<string>,
  percent: number
): SetDiscountStatus {
  const { item, setTitle } = line;
  const partners = basket.filter(
    (other) =>
      other.product_id !== item.product_id &&
      other.uuid !== item.uuid &&
      memberIds.has(other.product_id)
  );

  if (partners.length === 0) {
    return { state: "pending-partner", percent, setTitle, count: item.count };
  }

  if (partners.some((other) => materialsMatch(item, other))) {
    // Every matching unit is already covered by another line, so the only way
    // to earn the discount is to add more of the set.
    return { state: "pending-partner", percent, setTitle, count: item.count };
  }

  const partner = partners.find((other) => canSyncMaterials(item, other)) ?? partners[0];
  return {
    state: "pending-material",
    percent,
    setTitle,
    partnerUuid: partner.uuid,
    canSync: canSyncMaterials(item, partner),
    // Sum of all partner lines (matching or not): what the set could cover
    // once materials are synced, consistent with the active-count rule.
    count: Math.min(
      partners.reduce((sum, x) => sum + x.count, 0),
      item.count
    ),
  };
}

/**
 * Assigns set pairs within one material pool. A pair consumes one unit of two
 * lines of different products; per-line and per-product caps keep the result
 * feasible as an actual pairing, and pairs fill in round-robin basket order
 * until no compatible free pair remains, so equally-priced lines are covered
 * evenly.
 */
function allocatePool(pool: SetLine[], allocated: Map<string, number>): void {
  const total = pool.reduce((sum, line) => sum + line.item.count, 0);
  const byProduct = new Map<string, number>();
  for (const line of pool) {
    byProduct.set(
      line.item.product_id,
      (byProduct.get(line.item.product_id) ?? 0) + line.item.count
    );
  }

  // Max pairs: each needs two units, and at most `total - dominant` pairs can
  // avoid pairing a dominant product's units with itself.
  const dominant = Math.max(...byProduct.values());
  const maxPairs = Math.min(Math.floor(total / 2), total - dominant);
  if (maxPairs <= 0) {
    return;
  }

  let budget = maxPairs * 2; // one slot per pair end
  const remaining = pool.map((line) => line.item.count);
  const productRemaining = new Map<string, number>();
  for (const [product, count] of byProduct) {
    productRemaining.set(product, total - count);
  }

  // Every line in a pool shares the group's percent, so basket order is all
  // the tie-break the round-robin fill needs.
  const order = pool.map((line, i) => ({ line, i })).toSorted((a, b) => a.i - b.i);

  for (;;) {
    let progressed = false;
    for (const { line, i } of order) {
      if (budget <= 0 || remaining[i] <= 0) {
        continue;
      }
      const product = line.item.product_id;
      const productRemainingCount = productRemaining.get(product) ?? 0;
      if (productRemainingCount <= 0) {
        continue;
      }
      remaining[i] -= 1;
      productRemaining.set(product, productRemainingCount - 1);
      budget -= 1;
      allocated.set(line.item.uuid, (allocated.get(line.item.uuid) ?? 0) + 1);
      progressed = true;
    }
    if (budget <= 0 || !progressed) {
      return;
    }
  }
}

/**
 * The state of an item's best set discount relative to the current basket, for
 * surfacing in the UI. Per-item convenience lookup into `allocateSetDiscounts`,
 * which resolves the whole basket at once.
 */
export function resolveSetDiscountStatus(
  item: IProduct,
  basket: IProduct[],
  groups: SetDiscountGroup[]
): SetDiscountStatus | undefined {
  return allocateSetDiscounts(basket, groups).get(item.uuid);
}

/**
 * The set discount an item actively earns given the current basket: the `active`
 * case of the single shared rule implemented by `resolveSetDiscountStatus`.
 * `undefined` when the item earns no set discount yet.
 */
export function resolveActiveSetDiscount(
  item: IProduct,
  basket: IProduct[],
  groups: SetDiscountGroup[]
): ActiveDiscountStatus | undefined {
  const status = resolveSetDiscountStatus(item, basket, groups);
  return status?.state === "active" ? status : undefined;
}

/**
 * The active set discount of every basket item in one global pass: a map of
 * item uuid → status, holding only the items that earn a set discount. Price
 * each item from this map so the allocation runs exactly once per basket
 * rather than once per item.
 */
export function resolveActiveSetDiscounts(
  basket: IProduct[],
  groups: SetDiscountGroup[]
): Map<string, ActiveDiscountStatus> {
  const active = new Map<string, ActiveDiscountStatus>();
  for (const [uuid, status] of allocateSetDiscounts(basket, groups)) {
    if (status.state === "active") {
      active.set(uuid, status);
    }
  }
  return active;
}

export interface Price extends BasePrice {
  priced_by_length: false;
}

export interface LengthBasedPrice extends BasePrice {
  priced_by_length: true;
  length: number | undefined;
  per_meter_price: number | undefined;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function getFieldPrice(field: Field, product: IProduct): PricePart | null {
  // Skip pricing for fields that are used as the source of length-based pricing
  if (product.length_based_pricing && field.name === product.length_based_pricing.sourceField) {
    return null;
  }

  switch (field.type) {
    case "radio":
    case "color":
    case "select": {
      const items = field.items;
      const selectedItem = items?.find((item) => !!item && item.value === field.value?.value);
      return { label: field.label || field.name, price: selectedItem?.price ?? undefined };
    }
    case "toggle": {
      return {
        label: field.label || field.name,
        price:
          field.value?.value === undefined
            ? undefined
            : field.value.value
              ? (field.price ?? undefined)
              : 0,
      };
    }
    case "embroidery": {
      if (!field.value?.enabled) {
        return null;
      }
      const multiplier = field.price_unit === "word" ? countWords(field.value.text.value) : 1;
      return {
        label: field.label || field.name,
        price: field.price == null ? undefined : field.price * multiplier,
      };
    }
    case "input": {
      return {
        label: field.label || field.name,
        price: field.price ?? undefined,
      };
    }
    default: {
      return null;
    }
  }
}

function getMaterialPrice(
  value: Pick<ProductMaterialValue, "material_id">,
  productMaterials: CmsProductMaterial[],
  material_count: number,
  material_index: number
): PricePart | null {
  const material = productMaterials.find((m) => m?.material_path.material_id === value.material_id);

  const materialPrice = material?.price;
  return {
    label: material_count > 1 ? `Anyag ${(material_index + 1).toString()}` : "Anyag",
    price: materialPrice ?? undefined,
  };
}

export function calculatePriceForItem(
  product: IProduct,
  setStatus?: ActiveDiscountStatus
): Price | LengthBasedPrice {
  const parts: PricePart[] = [];
  for (const field of product.fields) {
    if (!isFieldVisible(field, product.fields)) {
      continue;
    }
    const fieldPrice = getFieldPrice(field, product);
    if (!fieldPrice) {
      continue;
    }
    parts.push(fieldPrice);
  }

  if (product.materials.materials.length > 0) {
    for (let i = 0; i < product.materials.material_required_count; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const value = product.materials.values?.[i];
      const price = getMaterialPrice(
        value ?? { material_id: "" },
        product.materials.materials,
        product.materials.material_required_count,
        i
      );
      if (!price) {
        continue;
      }
      parts.push(price);
    }
  }

  const basePrice: PricePart = { label: "Alapár", price: product.price };
  const allParts = [basePrice, ...parts];
  const unitPrice = Math.round(
    allParts.reduce((sum, part) => sum + Math.round(part.price ?? 0), 0)
  );
  const indeterminate = allParts.some((part) => part.price === undefined);

  let discount: DiscountInfo | undefined;
  if (setStatus?.percent != null && setStatus.percent > 0) {
    discount = {
      discount: 1 - (setStatus.percent * (setStatus.count / product.count)) / 100,
      discountSource: "set",
      discountAppliedCount: setStatus.count,
      percent: setStatus.percent,
    };
  } else if (
    product.discount &&
    product.discount_valid_until &&
    new Date() <= new Date(product.discount_valid_until)
  ) {
    discount = {
      discount: 1 - product.discount / 100,
      discountSource: "standalone",
      discountAppliedCount: product.count,
      percent: product.discount,
    };
  }

  const totalPrice = Math.round(
    unitPrice * product.count * (discount === undefined ? 1 : discount.discount)
  );

  if (product.length_based_pricing) {
    // The source field is validated at build time (data.ts) and resolved to a
    // number via the typed accessor; a blank/non-numeric value → no length.
    const lengthSource = product.length_based_pricing.sourceField;
    if (!lengthSource) {
      return {
        priced_by_length: true,
        length: undefined,
        options: parts,
        unitPrice: undefined,
        per_meter_price: unitPrice,
        totalPrice: undefined,
        basePrice,
        indeterminate,
        discountInfo: discount,
      };
    }

    const field = findFieldByName(product.fields, lengthSource);
    const cm = resolveNumericValue(field);
    const length = cm === undefined ? undefined : cm / 100;

    return {
      priced_by_length: true,
      length,
      options: parts,
      unitPrice: length === undefined ? undefined : unitPrice * length,
      per_meter_price: unitPrice,
      totalPrice: length === undefined ? undefined : totalPrice * length,
      basePrice,
      indeterminate,
      discountInfo: discount,
    };
  }

  return {
    options: parts,
    unitPrice,
    totalPrice,
    priced_by_length: false,
    basePrice,
    indeterminate,
    discountInfo: discount,
  };
}
