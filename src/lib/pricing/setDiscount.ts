import type { IProduct } from "../types.svelte";
import { calculatePriceForItem } from "./price";

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

/**
 * A product's selected material values as a counted multiset of canonical
 * tuples, order-independent and ignoring transient `error` fields. Each tuple
 * encodes the material id, its sorted colours and custom colour; the map value
 * counts how many times that exact selection was picked, so the same fabric
 * picked twice (or in two different colours) is preserved rather than collapsed.
 */
function materialEntries(product: IProduct): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of product.materials.values) {
    if (v == null || v.material_id === "") {
      continue;
    }
    const key = JSON.stringify({
      material_id: v.material_id,
      colors: v.colors.toSorted(),
      custom_color: v.custom_color ?? "",
    });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Total number of material selections in a multiset (counting duplicates). */
function materialCount(entries: Map<string, number>): number {
  let total = 0;
  for (const count of entries.values()) {
    total += count;
  }
  return total;
}

/**
 * Whether `small` is a multiset-subset of `large`: every selection appears in
 * `large` at least as many times. When both have the same total count this
 * reduces to exact equality, so equal-count selections only match when
 * identical; a subset match is possible only when the counts differ.
 */
function isMaterialSubset(small: Map<string, number>, large: Map<string, number>): boolean {
  for (const [value, count] of small) {
    if ((large.get(value) ?? 0) < count) {
      return false;
    }
  }
  return true;
}

/**
 * Two products count towards the same set when the smaller material selection is
 * a subset of the larger: every material it picked (id, colours and custom
 * colour, compared order-independently) appears identically — and at least as
 * often — on the other. Material *counts* need not be equal, so a one-fabric
 * blanket matches a two-fabric nest that shares that fabric; but when both pick
 * the same number of materials they must match exactly. Products with no
 * material selections match trivially. See the `product-sets` spec in
 * `openspec/`.
 */
export function materialsMatch(a: IProduct, b: IProduct): boolean {
  const ma = materialEntries(a);
  const mb = materialEntries(b);
  return materialCount(ma) <= materialCount(mb)
    ? isMaterialSubset(ma, mb)
    : isMaterialSubset(mb, ma);
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

/**
 * A formed set-discount instance: one unit each of two or more distinct set
 * members whose materials are mutually compatible. `members` lists the basket
 * line uuids (one per member product) that each contribute one unit, all
 * earning `percent`. See the `product-sets` spec in `openspec/`.
 */
export interface SetDiscountInstance {
  setTitle: string;
  percent: number;
  members: string[];
}

/**
 * The units of one basket line covered by set discounts, grouped by set. Every
 * entry's `count` units earn its `percent`; one line's units MAY span several
 * entries (different sets, including different percents).
 */
export interface SetCoverageEntry {
  setTitle: string;
  percent: number;
  count: number;
}

interface SetAllocation {
  statuses: Map<string, SetDiscountStatus>;
  instances: SetDiscountInstance[];
  coverage: Map<string, SetCoverageEntry[]>;
}

/**
 * Allocates set discounts across the whole basket per unit in one pass. Sets are
 * processed by descending discount percent (biggest wins per unit); within each
 * set the allocator repeatedly forms one *maximal* instance — one unit each of
 * every distinct, mutually material-compatible member that still has units,
 * preferring the most valuable line when a member has interchangeable units —
 * and repeats while at least two distinct members remain, consuming each basket
 * unit at most once. Leftover units earn no set discount. Returns the per-item
 * status (pending/active hints), the ordered list of formed instances, and each
 * line's per-set unit coverage (for pricing and the basket-level display). See
 * the `product-sets` spec in `openspec/`.
 */
function computeSetAllocation(basket: IProduct[], groups: SetDiscountGroup[]): SetAllocation {
  const materials = new Map<string, Map<string, number>>();
  const unitPrices = new Map<string, number>();
  for (const item of basket) {
    materials.set(item.uuid, materialEntries(item));
    unitPrices.set(item.uuid, calculatePriceForItem(item).unitPrice ?? 0);
  }
  const consumed = new Map<string, number>();
  const remaining = (item: IProduct): number => item.count - (consumed.get(item.uuid) ?? 0);
  const compatible = (a: string, b: string): boolean => {
    const ma = materials.get(a) ?? new Map<string, number>();
    const mb = materials.get(b) ?? new Map<string, number>();
    return materialCount(ma) <= materialCount(mb)
      ? isMaterialSubset(ma, mb)
      : isMaterialSubset(mb, ma);
  };

  const instances: SetDiscountInstance[] = [];
  // Biggest percent first so each unit lands in its most valuable set; ties keep
  // the group's original order for determinism.
  const ordered = groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.discount_percent != null && group.discount_percent > 0)
    .toSorted(
      (a, b) =>
        (b.group.discount_percent ?? 0) - (a.group.discount_percent ?? 0) || a.index - b.index
    );

  for (const { group } of ordered) {
    const percent = group.discount_percent ?? 0;
    const memberIds = new Set(group.products.map((m) => m.product_id));
    for (;;) {
      const chosen: string[] = [];
      const usedProducts = new Set<string>();
      for (const item of basket) {
        if (
          !memberIds.has(item.product_id) ||
          usedProducts.has(item.product_id) ||
          remaining(item) <= 0
        ) {
          continue;
        }
        // The members still to be added after this one; a candidate that stays
        // compatible with more of them keeps the set formable.
        const pendingMembers = [...memberIds].filter(
          (id) => id !== item.product_id && !usedProducts.has(id)
        );
        const joinableCount = (unit: IProduct): number =>
          pendingMembers.filter((id) =>
            basket.some(
              (v) =>
                v.product_id === id &&
                remaining(v) > 0 &&
                compatible(unit.uuid, v.uuid) &&
                chosen.every((c) => compatible(c, v.uuid))
            )
          ).length;
        // Among interchangeable units of this member still available and
        // compatible with the units already chosen, prefer the one that keeps
        // the most remaining members joinable, then the most valuable so the
        // discount lands on the priciest qualifying line (ties keep basket
        // order for determinism).
        let candidate: IProduct | undefined;
        let candidateJoinable = -1;
        for (const other of basket) {
          if (
            other.product_id !== item.product_id ||
            remaining(other) <= 0 ||
            !chosen.every((uuid) => compatible(uuid, other.uuid))
          ) {
            continue;
          }
          const otherJoinable = joinableCount(other);
          if (
            candidate === undefined ||
            otherJoinable > candidateJoinable ||
            (otherJoinable === candidateJoinable &&
              (unitPrices.get(other.uuid) ?? 0) > (unitPrices.get(candidate.uuid) ?? 0))
          ) {
            candidate = other;
            candidateJoinable = otherJoinable;
          }
        }
        if (candidate) {
          chosen.push(candidate.uuid);
          usedProducts.add(candidate.product_id);
        }
      }
      if (chosen.length < 2) {
        break;
      }
      for (const uuid of chosen) {
        consumed.set(uuid, (consumed.get(uuid) ?? 0) + 1);
      }
      instances.push({ setTitle: group.title, percent, members: chosen });
    }
  }

  const coverage = new Map<string, SetCoverageEntry[]>();
  for (const instance of instances) {
    for (const uuid of instance.members) {
      const entries = coverage.get(uuid) ?? [];
      const existing = entries.find(
        (e) => e.setTitle === instance.setTitle && e.percent === instance.percent
      );
      if (existing) {
        existing.count += 1;
      } else {
        entries.push({ setTitle: instance.setTitle, percent: instance.percent, count: 1 });
      }
      coverage.set(uuid, entries);
    }
  }

  const statuses = new Map<string, SetDiscountStatus>();
  for (const item of basket) {
    const entries = coverage.get(item.uuid);
    if (entries && entries.length > 0) {
      const best = entries.reduce((a, b) => (b.percent > a.percent ? b : a));
      const count = entries.reduce((sum, e) => sum + e.count, 0);
      statuses.set(item.uuid, {
        state: "active",
        percent: best.percent,
        setTitle: best.setTitle,
        count,
      });
      continue;
    }
    const pending = pendingStatus(item, basket, groups);
    if (pending) {
      statuses.set(item.uuid, pending);
    }
  }

  return { statuses, instances, coverage };
}

/**
 * The pending state an item reports when it earns no set discount: resolved
 * against the biggest-percent set it belongs to. `pending-partner` when no
 * sibling with compatible materials is in the basket (including when every
 * matching unit is already allocated to other lines, in which case adding more
 * of the set is the fix), `pending-material` when a sibling is present but its
 * materials are incompatible. `undefined` when the item is in no discounted set.
 */
function pendingStatus(
  item: IProduct,
  basket: IProduct[],
  groups: SetDiscountGroup[]
): SetDiscountStatus | undefined {
  const candidates = groups
    .filter(
      (group) =>
        group.discount_percent != null &&
        group.discount_percent > 0 &&
        group.products.some((m) => m.product_id === item.product_id)
    )
    .toSorted((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0));

  const group = candidates.at(0);
  if (!group) {
    return undefined;
  }
  const percent = group.discount_percent ?? 0;
  const setTitle = group.title;
  const memberIds = new Set(group.products.map((m) => m.product_id));
  const partners = basket.filter(
    (other) =>
      other.product_id !== item.product_id &&
      other.uuid !== item.uuid &&
      memberIds.has(other.product_id)
  );

  if (partners.length === 0 || partners.some((other) => materialsMatch(item, other))) {
    // No partner in the basket, or every compatible unit is already allocated
    // elsewhere — either way, adding more of the set is the fix.
    return { state: "pending-partner", percent, setTitle, count: item.count };
  }

  const partner = partners.find((other) => canSyncMaterials(item, other)) ?? partners[0];
  return {
    state: "pending-material",
    percent,
    setTitle,
    partnerUuid: partner.uuid,
    canSync: canSyncMaterials(item, partner),
    count: Math.min(
      partners.reduce((sum, x) => sum + x.count, 0),
      item.count
    ),
  };
}

/**
 * Per-item set status of every basket item in one global pass. A per-item
 * lookup into the shared allocation; use `resolveSetInstances` /
 * `resolveSetCoverage` for the basket-level display and pricing.
 */
export function allocateSetDiscounts(
  basket: IProduct[],
  groups: SetDiscountGroup[]
): Map<string, SetDiscountStatus> {
  return computeSetAllocation(basket, groups).statuses;
}

/**
 * The set-discount instances formed by the current basket, in allocation order,
 * for the basket-level "set discounts" display.
 */
export function resolveSetInstances(
  basket: IProduct[],
  groups: SetDiscountGroup[]
): SetDiscountInstance[] {
  return computeSetAllocation(basket, groups).instances;
}

/**
 * Each basket line's per-set unit coverage, keyed by line uuid, for pricing via
 * `calculatePriceForItem`. Lines with no set coverage are absent from the map.
 */
export function resolveSetCoverage(
  basket: IProduct[],
  groups: SetDiscountGroup[]
): Map<string, SetCoverageEntry[]> {
  return computeSetAllocation(basket, groups).coverage;
}

/**
 * The forint amount a formed set instance takes off the order: one unit of each
 * member at the set percent. `indeterminate` when any member's unit price is
 * unknown (a partial configuration). Shared by the checkout display and the
 * submitted order text so both report the same number.
 */
export function setInstanceAmount(
  instance: SetDiscountInstance,
  basket: IProduct[]
): { amount: number; indeterminate: boolean } {
  const byUuid = new Map(basket.map((p) => [p.uuid, p]));
  let amount = 0;
  let indeterminate = false;
  for (const uuid of instance.members) {
    const item = byUuid.get(uuid);
    const unitPrice = item ? calculatePriceForItem(item).unitPrice : undefined;
    if (unitPrice === undefined) {
      indeterminate = true;
    } else {
      amount += Math.round((unitPrice * instance.percent) / 100);
    }
  }
  return { amount, indeterminate };
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
