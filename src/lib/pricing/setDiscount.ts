import type { IProduct } from "../types.svelte";
import { calculatePriceForItem } from "./price";

/** Minimal structural shape of a product group, to avoid a data.ts import cycle. */
export interface SetDiscountGroup {
  title: string;
  /** Flat forint discount removed once per formed set instance. */
  discount_amount?: number | undefined;
  products: { product_id: string }[];
}

/**
 * Whether a product group grants a set discount (a positive flat amount). A
 * group with a zero or absent amount is "related items" (cross-sell only), not
 * a set. The one home for the set-vs-related rule. See `CONTEXT.md`.
 */
export function isSet(group: SetDiscountGroup): boolean {
  return (group.discount_amount ?? 0) > 0;
}

/**
 * The product ids of the other members of every discount-granting set the
 * product belongs to, merged across sets and de-duplicated (the product itself
 * excluded). Callers resolve the ids against the catalog. Related-items groups
 * contribute nothing.
 */
export function siblingsFor(productId: string, groups: SetDiscountGroup[]): string[] {
  const out: string[] = [];
  for (const group of groups) {
    if (!isSet(group) || !group.products.some((m) => m.product_id === productId)) {
      continue;
    }
    for (const { product_id } of group.products) {
      if (product_id !== productId && !out.includes(product_id)) {
        out.push(product_id);
      }
    }
  }
  return out;
}

/**
 * The no-discount "related items" groups the product belongs to, in group order,
 * each with its other members' product ids (de-duplicated, the product itself
 * excluded). Discount-granting sets are ignored. Callers resolve the ids against
 * the catalog and drop empty groups.
 */
export function relatedGroupsFor(
  productId: string,
  groups: SetDiscountGroup[]
): { title: string; members: string[] }[] {
  const out: { title: string; members: string[] }[] = [];
  for (const group of groups) {
    if (isSet(group) || !group.products.some((m) => m.product_id === productId)) {
      continue;
    }
    const members: string[] = [];
    for (const { product_id } of group.products) {
      if (product_id !== productId && !members.includes(product_id)) {
        members.push(product_id);
      }
    }
    out.push({ title: group.title, members });
  }
  return out;
}

/**
 * The best set discount a product qualifies for: the largest flat set amount
 * across every set the product belongs to. When a product is in more than one
 * set, the biggest discount wins (no stacking). Groups with a zero or absent
 * amount are not sets and are ignored. See the `product-sets` spec in
 * `docs/specs/product-sets.md`.
 */
export function resolveSetDiscount(
  productId: string,
  groups: SetDiscountGroup[]
): { amount: number; setTitle: string } | undefined {
  let best: { amount: number; setTitle: string } | undefined;
  for (const group of groups) {
    if (!isSet(group) || !group.products.some((m) => m.product_id === productId)) {
      continue;
    }
    const amount = group.discount_amount ?? 0;
    if (!best || amount > best.amount) {
      best = { amount, setTitle: group.title };
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
 * material selections match trivially. See the `product-sets` spec in `docs/specs/product-sets.md`.
 */
export function materialsMatch(a: IProduct, b: IProduct): boolean {
  const ma = materialEntries(a);
  const mb = materialEntries(b);
  return materialCount(ma) <= materialCount(mb)
    ? isMaterialSubset(ma, mb)
    : isMaterialSubset(mb, ma);
}

/**
 * The set discount an item actively earns given the current basket: the
 * winning set's title and how many of the item's units it covers. The flat
 * forint figure is a property of the formed instance (see `ResolvedSetInstance`)
 * and is surfaced at basket level, not per line.
 */
export type ActiveDiscountStatus = {
  state: "active";
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
  | { state: "pending-partner"; setTitle: string; count: number }
  | {
      state: "pending-material";
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
 * line uuids (one per member product) that each contribute one unit. `amount`
 * is the set's nominal flat forint discount for this instance; the amount it
 * actually removes is clamped by `clampInstanceAmount`. See the `product-sets`
 * spec in `docs/specs/product-sets.md`.
 */
interface SetDiscountInstance {
  setTitle: string;
  amount: number;
  members: string[];
}

/**
 * The units of one basket line covered by set instances, grouped by set. Every
 * entry's `count` units belong to a formed instance of its set; one line's
 * units MAY span several entries (different sets). Used internally to derive
 * each line's active status.
 */
interface SetCoverageEntry {
  setTitle: string;
  amount: number;
  count: number;
}

interface SetAllocation {
  statuses: Map<string, SetDiscountStatus>;
  instances: SetDiscountInstance[];
  coverage: Map<string, SetCoverageEntry[]>;
}

/**
 * Allocates set discounts across the whole basket per unit in one pass. Sets are
 * processed by descending flat discount amount (biggest wins per unit); within
 * each set the allocator repeatedly forms one *maximal* instance — one unit each
 * of every distinct, mutually material-compatible member that still has units,
 * preferring the most valuable line when a member has interchangeable units —
 * and repeats while at least two distinct members remain, consuming each basket
 * unit at most once. Leftover units earn no set discount. Returns the per-item
 * status (pending/active hints), the ordered list of formed instances, and each
 * line's per-set unit coverage. See the `product-sets` spec in `docs/specs/product-sets.md`.
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
  // Biggest flat amount first so each unit lands in its most valuable set; ties
  // keep the group's original order for determinism.
  const ordered = groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.discount_amount != null && group.discount_amount > 0)
    .toSorted(
      (a, b) => (b.group.discount_amount ?? 0) - (a.group.discount_amount ?? 0) || a.index - b.index
    );

  for (const { group } of ordered) {
    const amount = group.discount_amount ?? 0;
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
      instances.push({ setTitle: group.title, amount, members: chosen });
    }
  }

  const coverage = new Map<string, SetCoverageEntry[]>();
  for (const instance of instances) {
    for (const uuid of instance.members) {
      const entries = coverage.get(uuid) ?? [];
      const existing = entries.find(
        (e) => e.setTitle === instance.setTitle && e.amount === instance.amount
      );
      if (existing) {
        existing.count += 1;
      } else {
        entries.push({ setTitle: instance.setTitle, amount: instance.amount, count: 1 });
      }
      coverage.set(uuid, entries);
    }
  }

  const statuses = new Map<string, SetDiscountStatus>();
  for (const item of basket) {
    const entries = coverage.get(item.uuid);
    if (entries && entries.length > 0) {
      const best = entries.reduce((a, b) => (b.amount > a.amount ? b : a));
      const count = entries.reduce((sum, e) => sum + e.count, 0);
      statuses.set(item.uuid, {
        state: "active",
        setTitle: best.setTitle,
        count,
      });
      continue;
    }
    const pending = pendingStatus(item, basket, groups, consumed);
    if (pending) {
      statuses.set(item.uuid, pending);
    }
  }

  return { statuses, instances, coverage };
}

/**
 * The pending state an item reports when it earns no set discount: resolved
 * against the biggest-amount set it belongs to. `pending-partner` when no
 * sibling with compatible materials has unallocated units left in the basket
 * (none present, or every matching unit is already consumed by a formed set, in
 * which case adding more of the set is the fix), `pending-material` when a
 * sibling with free units is present but its materials are incompatible.
 * `undefined` when the item is in no discounted set. `consumed` counts the units
 * of each line already spent on formed instances, so a fully-consumed partner is
 * not offered as a material-sync target.
 */
function pendingStatus(
  item: IProduct,
  basket: IProduct[],
  groups: SetDiscountGroup[],
  consumed: Map<string, number>
): SetDiscountStatus | undefined {
  const candidates = groups
    .filter(
      (group) =>
        group.discount_amount != null &&
        group.discount_amount > 0 &&
        group.products.some((m) => m.product_id === item.product_id)
    )
    .toSorted((a, b) => (b.discount_amount ?? 0) - (a.discount_amount ?? 0));

  const group = candidates.at(0);
  if (!group) {
    return undefined;
  }
  const setTitle = group.title;
  const memberIds = new Set(group.products.map((m) => m.product_id));
  const partners = basket.filter(
    (other) =>
      other.product_id !== item.product_id &&
      other.uuid !== item.uuid &&
      memberIds.has(other.product_id) &&
      other.count - (consumed.get(other.uuid) ?? 0) > 0
  );

  if (partners.length === 0 || partners.some((other) => materialsMatch(item, other))) {
    // No partner in the basket, or every compatible unit is already allocated
    // elsewhere — either way, adding more of the set is the fix.
    return { state: "pending-partner", setTitle, count: item.count };
  }

  const partner = partners.find((other) => canSyncMaterials(item, other)) ?? partners[0];
  return {
    state: "pending-material",
    setTitle,
    partnerUuid: partner.uuid,
    canSync: canSyncMaterials(item, partner),
    count: Math.min(
      partners.reduce((sum, x) => sum + (x.count - (consumed.get(x.uuid) ?? 0)), 0),
      item.count
    ),
  };
}

/**
 * The forint amount a formed set instance actually removes from the order: the
 * set's flat `amount`, clamped so it never exceeds the covered units' charged
 * subtotal (one unit of each member, each after its own standalone discount).
 * `nominal` is the set's unclamped flat amount, kept so the order email can show
 * both. Members whose price is unknown contribute nothing to the subtotal.
 */
function clampInstanceAmount(
  instance: SetDiscountInstance,
  basket: IProduct[]
): { amount: number; nominal: number } {
  const byUuid = new Map(basket.map((p) => [p.uuid, p]));
  let subtotal = 0;
  for (const uuid of instance.members) {
    const item = byUuid.get(uuid);
    if (!item) {
      continue;
    }
    const price = calculatePriceForItem(item);
    const unitPrice = price.unitPrice;
    if (unitPrice === undefined) {
      continue;
    }
    const factor = price.discountInfo?.discount ?? 1;
    subtotal += Math.round(unitPrice * factor);
  }
  return { amount: Math.min(instance.amount, subtotal), nominal: instance.amount };
}

/**
 * A formed set instance as surfaced to the UI and order: its member basket
 * lines, the set's nominal flat discount, and the `amount` it actually removes
 * (clamped to the covered subtotal by {@link clampInstanceAmount}).
 */
export interface ResolvedSetInstance {
  setTitle: string;
  members: string[];
  nominal: number;
  amount: number;
}

/**
 * The current basket's set pricing, resolved in one allocation pass: each item's
 * set-discount `status`, the formed `instances` (each with its clamped amount),
 * the `itemsTotal` subtotal (standalone discounts already applied), and the
 * `setDiscountTotal` those instances remove. Read by the checkout display, the
 * deals panel, and order submission so the price shown always equals the price
 * charged. See the `product-sets` spec in `docs/specs/product-sets.md`.
 */
export interface BasketPricing {
  statuses: Map<string, SetDiscountStatus>;
  instances: ResolvedSetInstance[];
  itemsTotal: number;
  setDiscountTotal: number;
}

/** Resolve the whole basket's set pricing in a single allocation pass. */
export function resolveBasketPricing(
  basket: IProduct[],
  groups: SetDiscountGroup[]
): BasketPricing {
  const allocation = computeSetAllocation(basket, groups);
  const instances = allocation.instances.map((instance): ResolvedSetInstance => {
    const { amount, nominal } = clampInstanceAmount(instance, basket);
    return { setTitle: instance.setTitle, members: instance.members, nominal, amount };
  });
  const itemsTotal = basket.reduce((sum, p) => sum + (calculatePriceForItem(p).totalPrice ?? 0), 0);
  const setDiscountTotal = instances.reduce((sum, instance) => sum + instance.amount, 0);
  return { statuses: allocation.statuses, instances, itemsTotal, setDiscountTotal };
}
