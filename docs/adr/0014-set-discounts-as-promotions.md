# ADR 0014: Set discounts as one Promotion per set — membership and amount in promotion args

- **Status:** proposed (owner feedback pending; supersedes the group-storage
  part of ADR 0010 decision 6 and the collection-based set model of
  [product-sets.md](../specs/product-sets.md) — ADR 0005's money model stands)
- **Date:** 2026-11-07

## Context

Gate testing on the cutover preview found two things:

1. **The owner UX is unacceptable.** A set discount is created by making a
   private child collection under the "Szettek" parent, listing member
   products via the native `product-id-filter`, and typing the discount into
   the `setDiscount` Collection custom field. Nothing in the dashboard points
   at it — the owner could not find the existing 2 set discounts (Szettek
   itself shows as an empty collection). The owner's model is instead: a set
   is made of top-level products (which membership already is), and the
   discount is a Promotion configured in the Promotions section — one
   promotion per set.
2. **A data bug confirmed the model is fragile.** Every group collection
   (parent and children) has `inheritFilters: true` and the parents carry a
   `product-id-filter` with an empty `productIds` list, which AND-combines to
   `1 = 0` — so the apply-collection-filters job keeps every group's contents
   at zero (preview and prod alike). Harmless to pricing (the set machinery
   reads the children's filters directly), but the dashboard displays empty
   sets.

Two facts the owner supplied make the simpler model possible:

- Membership is already **product-level** (never variants); material/color
  matching is evaluated per basket line from the buyer's material picks, not
  from membership.
- **No product belongs to two discounted sets, in practice.** The
  cross-set arbitration rules of ADR 0003/0005 (biggest amount first, one
  shared unit budget) only exist to resolve overlaps.

## What matters (ranked)

1. **Owner UX** — set discounts are visible and creatable in the Promotions
   section, reading like any other promotion.
2. **Money correctness** — per-formed-instance deduction of a flat Ft amount,
   clamped to the covered units' subtotal, landing on the member lines
   (ADR 0005's model, unchanged), and never double-counting across sets.
3. **Stock UI, minimal custom code** — no `pnpm patch`, no bespoke forms;
   args render through the dashboard's built-in input components.
4. **Site and shop-API compatibility** — the buyer experience is unchanged;
   `Order.setDiscounts`, `OrderLine.setState` and `productGroups` keep their
   shape, so the checkout and the site need no change.
5. **A future simplification path** — if single-instance sets are ever
   guaranteed, the stock fixed-amount action can replace the custom one.

## Options

- **A. One Promotion per set; membership and amount in the promotion's args
  (chosen).** Condition "Szett-tagok (anyagegyezéssel)" args: member products
  (`ID` list rendered by the stock `product-multi-form-input`); action
  "Szett-kedvezmény kiosztása" arg: the flat Ft amount (`int` rendered by the
  stock number input). The material gating is not an arg: it is the
  condition's built-in behavior (a promotion condition is an order-level
  verdict; the per-line set states are the allocation's output and cannot
  become a separate condition). Related-items groups remain collections.
- **B. Keep set collections; the promotion references the collection.**
  Requires a `pnpm patch` to add a collection-selector arg component (the
  dashboard has none and exposes no arg-component extension point), and
  splits each set's data across two surfaces.
- **C. Status quo (one argless promotion + collections), made findable with a
  dashboard block on the promotion detail page.** Keeps the convoluted flow.
- **D. Fully stock promotion: stock condition + stock fixed-order-discount
  action.** The stock action deducts its arg once per order: it cannot
  multiply by the number of formed instances, cannot clamp to the covered
  subtotal, and writes order-level (not per-line) adjustments. Rejected for
  correctness; revisit only if single-instance sets are ever guaranteed.
- **E. Do nothing.** Fails the owner's UX requirement outright.

## Decision

1. **One active Promotion per discounted set.** The condition args list the
   member products; the action arg carries the flat Ft amount. The
   promotion's Hungarian name is the set label the buyer sees.
2. **The no-overlap invariant is enforced, not assumed:** saving a promotion
   (or changing members) whose product list intersects another active set
   promotion's is rejected with a Hungarian message; if the data drifts
   anyway (direct API writes), the shared allocation refuses to apply with a
   loud error rather than double-count. If overlaps are ever wanted, this
   ADR is revisited.
3. **The allocation code is unchanged in substance**: the same
   material-gated, greedy, clamped allocation runs per promotion;
   `SetBasketService` aggregates the per-promotion results for the shop API
   (`Order.setDiscounts`, `OrderLine.setState` keep their shape). The group
   id surfaced to the site becomes the promotion id.
4. **Related-items groups stay collections** (children of the
   "Kapcsolódó termékek" parent, membership via the native
   `product-id-filter`). The "Szettek" parent and its children are retired;
   the group-parent guard keeps protecting "Kapcsolódó termékek" only.
5. **The dashboard UX becomes stock end to end**: Promotions lists every set
   discount by name and amount; creating a set is creating a promotion;
   disabling a promotion removes the discount (its members surface as
   related items only through a related collection). Collections are no
   longer involved in set discounts at all.

## Rollout plan

1. **Backend rework** — condition/action args, per-promotion allocation,
   `SetBasketService` and the `productGroups` projection reading promotions,
   save-time overlap validation, guard update; `setDiscount` leaves
   `vendure-config.ts` and the fixtures.
2. **Versioned migration (one transaction's worth of steps)** — delete the
   old argless promotion; create the two replacement promotions (Babafészek
   1 000 Ft with members [13,14]; Ovis szett 1 300 Ft with members [39,40]);
   drop the `setDiscount` column; remove the empty `product-id-filter` from
   the "Kapcsolódó termékek" parent (the contents-zero bug) and delete the
   "Szettek" parent with its children.
3. **Tests** — unit specs reworked to the args model (allocation unchanged in
   math, money half moved from condition state to action arg); integration
   seam tests: discount forms via a per-set promotion, overlapping promotions
   rejected at save, a disabled promotion surfaces no set; checkout E2E
   unchanged.
4. **Docs** — product-sets.md rewritten to this model; the roadmap's epic-2
   line updated; ADR 0010 gets a superseding pointer at decision 6.
5. **Owner click-through (new B4)** — Promotions lists both sets by name and
   amount; create a third; disable one; enable again. Nothing else in the
   cutover test plan changes.
