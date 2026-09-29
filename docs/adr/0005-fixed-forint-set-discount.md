# ADR 0005: Fixed-forint set discount, stacking with standalone, related-items groups

- **Status:** accepted (supersedes the percent model of ADR 0003)
- **Date:** 2026-09

## Context

ADR 0003 modelled a set discount as one `discount_percent` per set, applied
per member unit, where a set discount superseded any standalone product
discount ("at most one discount per unit"). Two problems drove this revision:

- **Percent is the wrong unit for the owner.** The shop reasons about sets as
  "this set costs 1000 Ft less", not "12% off". A percent of a variable base
  price is hard to set intentionally and hard to communicate.
- **Superseding standalone discounts penalised set buyers.** During a sale, a
  buyer who assembled a set could end up worse off than someone buying the same
  items loose, because the set discount replaced (rather than added to) the
  standalone sale discount. Customers "felt robbed".

The material-gated matching and the per-unit greedy allocation of ADR 0003 were
not the problem and are retained.

## Decision

1. **Flat forint amount per set, per formed instance.** The CMS field becomes
   `discount_amount` (label "Szett kedvezmény (Ft)"), an optional non-negative
   integer, `min: 0`, no upper bound. A formed set instance (one unit each of
   2+ compatible members) subtracts this flat amount **once**. No percent
   anywhere.
2. **`0` ≡ absent ≡ no discount.** A group with `discount_amount` of `0` or
   unset forms no instance, contributes no coverage, no basket entry, no
   pending hints. It is not a set — it is _Related items_ (decision 7).
3. **Biggest flat amount wins, no stacking across sets.** When a product
   belongs to several discounted sets, allocation orders candidate instances by
   descending `discount_amount` (tie-break by config order), consuming each
   unit at most once. Set discounts still never stack with each other.
4. **Set and standalone discounts stack.** The standalone percent discount
   (date-gated by `discount_valid_until`) applies uniformly to **all** units,
   including set-covered ones. The old "set supersedes standalone" rule is
   removed. Order of operations: apply standalone% to line totals first, then
   subtract flat set-instance deductions.
5. **Clamp to the charged subtotal.** Each instance's deduction is clamped to
   the covered units' subtotal **after** standalone discount, so a set can
   never drive an instance (or the order) below zero.
6. **Basket-level display only; discount figure leaves the product page.** The
   flat deduction is shown only in the basket "Szett kedvezmények" section
   (`CheckoutDeals`), per instance. The per-line "Szett kedvezmény −%" rows
   (`OrderItemPrice`, `CheckoutItem`) and the discount figure on the
   configurator (`SetPanel`) are removed — a per-instance flat amount is
   meaningless inside a single line. The configurator keeps its structural
   cross-sell (siblings, add-to-set, pending/active status) without the number.
7. **Discount-less groups are "Related items", not sets.** A group with no
   discount renders on the product page as a separate "Kapcsolódó termékek"
   cross-sell block, distinct from the set panel. When a product belongs to
   several such groups, each group renders as its own separate list (not merged
   into one flat list).
8. **Order email records full discount provenance.** Per line: unit price plus
   standalone discount (percent and resulting Ft) when active. Plus a
   set-discounts section: per formed instance, the set title, the member units
   it covers, the **nominal** flat Ft, and the **actually applied** (clamped)
   Ft. The owner can see every discount and its source without recomputation.

## Consequences

- `DiscountInfo`'s single-discount-per-line assumption changes: a line can now
  carry a standalone discount **and** be part of a set instance. The recorded
  shape must carry a flat Ft amount (not a percent) for set discounts and allow
  both sources on the same units.
- `computeSetAllocation` orders by `discount_amount` instead of
  `discount_percent`; `setInstanceAmount` returns the clamped flat amount
  rather than a per-member percent computation.
- `price.ts` no longer folds the set discount into a per-line multiplier; set
  deductions are basket-level. Line totals reflect standalone only.
- Existing content is migrated: `babafeszek-szett` → 1000, `ovis-szett` → 1300,
  `ovis-felszereles` → 0 (becomes a Related-items group).
- Specs `product-sets.md` and `order-pricing.md` must be updated: drop
  "at most one discount / superseded by set discount", replace percent language
  with flat-amount language, and describe the related-items presentation.
- Greedy-vs-optimal trade-off from ADR 0003 is unchanged and still accepted.
