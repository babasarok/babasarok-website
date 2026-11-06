import type { OrderProductGroup } from "./types";

/**
 * Whether a product group grants a set discount (a positive flat amount). A
 * group with a zero or absent amount is "related items" (cross-sell only), not
 * a set. The one home for the set-vs-related rule. See `CONTEXT.md`.
 */
export function isSet(group: OrderProductGroup): boolean {
  return (group.discount_amount ?? 0) > 0;
}

/**
 * The product ids of the other members of every discount-granting set the
 * product belongs to, merged across sets and de-duplicated (the product itself
 * excluded). Callers resolve the ids against the catalog. Related-items groups
 * contribute nothing.
 */
export function siblingsFor(productId: string, groups: OrderProductGroup[]): string[] {
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
  groups: OrderProductGroup[]
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
  groups: OrderProductGroup[]
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
