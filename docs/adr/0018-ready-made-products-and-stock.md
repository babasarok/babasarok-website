# ADR 0018 — Ready-made products: native stock, placed orders hold the unit

Status: proposed

## Context

The storefront so far only served configurator products: a product without a
canonical definition (`Product.productDefinition: null`) was treated as "not a
storefront product" and dropped from the list, search, sitemap and home block,
with its detail page answering "not found". The owner has one-off, ready-made
items to sell (first one: the Babafészek szett, a single physically existing
piece currently disabled in production) — products buyers order as-is, with no
configuration. Vendure supports this natively: a plain product's variant can
track inventory (`stockOnHand`, edited on the stock product page), and only
our specs excluded such products.

Stock has a subtlety. In Vendure's default flow a basket only _checks_ the
saleable stock — a line in an active order holds nothing; stock allocates only
on the transition to `PaymentAuthorized`/`PaymentSettled` (the default
`StockAllocationStrategy`). Our checkout stops at `ArrangingPayment` (ADR 0013
— no payment step yet), so under defaults **nothing in our flow ever holds
stock**: with one unit in stock, two baskets could each hold it and both check
out — a guaranteed oversell for a one-off item.

## Priorities (ranked)

1. **No oversell** — a sold unit must not be sellable again until the owner
   cancels the order.
2. **Native over bespoke** — use Vendure's stock machinery, not a custom
   reservation system.
3. **Buyer clarity** — a buyer who lost the unit race sees why checkout is
   blocked, in Hungarian, through the existing stale-line UX.
4. **The owner's workflow stays simple** — enable the product with stock 1;
   the sold-out state is automatic (the product hides itself).

## Decision

1. **A definition-less enabled product is a ready-made storefront product.**
   It is listed, searchable and sitemap-listed like any product; its detail
   page is a plain order block (variant price, quantity, add-to-basket) with
   no configurator. Its variant tracks inventory.
2. **A basket checks stock; a placed order holds it.** A custom
   `stockAllocationStrategy` allocates on the checkout transition
   (`AddingItems → ArrangingPayment`), which is the flow's final state.
   Vendure's transition-time stock guard then takes the allocation lock in the
   same transaction, so simultaneous checkouts serialize; the loser's line
   flags `OUT_OF_STOCK` (order-basket spec) and the transition is refused.
   Cancelling the placed order releases the unit; fulfilling it sells it and
   releases the allocation — all native.
3. **Sold out means hidden.** When the saleable stock hits 0 the product drops
   out of the list, search, sitemap and home block and its detail page shows
   "not found" — the same treatment definition-less products had before. No
   sold-out page or badge; the owner disables nothing by hand.

### Alternatives considered

- **Sell it as a configurator product** (zero-field definition): no stock
  enforcement at all (the sync sets `trackInventory = FALSE`), and an
  abandoned basket at the payment step would oversell silently. Rejected.
- **Show a sold-out page** instead of hiding: extra UI for a state the owner
  can never restock (a one-off item). Rejected for now; the `OUT_OF_STOCK`
  line reason still explains state to buyers holding stale lines.
- **Reserve on add-to-basket**: true reservation needs lifecycle handling for
  abandoned baskets (leak stock indefinitely) — a bespoke system. Rejected;
  "placed order holds" is the honest, native middle ground.

### Rollout

- Backend: the allocation strategy, the `OUT_OF_STOCK` line reason, and the
  migration that turns the Babafészek szett (native product 46) into a
  ready-made product (drops its definition, re-enables inventory tracking on
  its variant, sets `stockOnHand` 1) — rehearsed in the integration suite.
- Site: the ready-made product page, the sold-out hiding, the Hungarian
  wording for the stock refusals.
- Owner afterwards: assign a Terméktípus facet value on 46 (type filtering),
  review the product's gallery/price, flip Enabled.

## Consequences

- A buyer who abandons checkout at the payment step holds the unit until the
  owner cancels the order (epic 5's order work). Accepted: the owner works
  orders daily, and the alternative (reservation timeouts) is bespoke.
- Bundling the definition removal of product 46 into a migration ties one
  product's data to the deploy. Accepted: it is the one product affected, and
  migrations are the repo's only prod-write path.
