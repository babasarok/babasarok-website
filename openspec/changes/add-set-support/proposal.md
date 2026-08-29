# Change: add set support

## Why

Buyers order baby products in coordinated sets (e.g. a basket with its matching
blanket), but the site had no way to model or reward buying them together: no
bundle pricing, no way to configure an order from a product page, and the order
form only lived on the contact page. This change adds product "sets" with a
single percent discount, a persisted basket with a checkout page, and an
order configurator on product detail pages.

## What Changes

- New `product_groups` CMS collection: a set is a group of products carrying one
  optional `discount_percent` shared by all members.
- Set discount resolution: the biggest set percent a product qualifies for wins
  (no stacking); a set is *material-gated* (members must have exactly matching
  material selections) and allocated *globally* across the basket (one set
  consumes one unit of two different members; each unit is consumed at most
  once). The set discount replaces the standalone product discount for the
  allocated units.
- Basket: lines gain a stable identity; duplicate lines (same product, fields,
  materials) merge; a single live basket view is shared by all order islands and
  kept in sync across tabs; a nav basket in the header shows the count and links
  to `/checkout`.
- Ordering UI: the order form moves from the contact page to a dedicated
  `/checkout` page (with set-deal summary and line management); the contact page
  becomes a plain contact page. Product detail pages for orderable products
  embed an order configurator with set status UI ("add related" set members,
  pending-discount hints, one-click material sync) and support deep links that
  prefill selections from URL query parameters.
- Pricing: item totals reflect the set discount for the allocated fraction of
  the quantity; the discount source ("set" vs "standalone") is recorded for the
  price breakdown and the order email.

## Capabilities

### New Capabilities

- `product-sets`: product set (group) content model, set discount resolution,
  material-gated global set detection, and set status surfacing in the UI.

### Modified Capabilities

- `order-pricing`: set discount takes precedence over the standalone product
  discount and is applied per allocated unit; discount source is recorded.
- `order-basket`: lines gain identity and duplicate merging; a shared live
  basket is synced across islands and tabs; nav basket in the header.
- `order-submission`: the order form moves to the `/checkout` page; the contact
  page becomes a plain contact page.
- `product-catalog`: product detail pages embed an order configurator with set
  status UI and support prefill deep links.

## Impact

- Content/CMS: new `product_groups` collection (`tina/collections/product-groups.ts`),
  `getProductGroups` loader, Astro content config entry.
- Domain logic: `src/lib/priceUtils.ts` (set resolution/allocation),
  `src/lib/orderBasket.svelte.ts` (shared basket store),
  `src/lib/orderStorage.ts` (line identity, merge), `src/lib/orderQueryParams.ts`
  (deep-link prefill), `src/lib/orderSubmit.ts` (discount source in email).
- UI: new `ProductOrder`, `SetPanel`, `SetSiblingCard`, `CheckoutForm`,
  `CheckoutItem`, `CheckoutDeals`, `NavBasket` islands; `Header.astro`,
  `product/[id].astro`, new `checkout.astro`; contact page simplified.
- Tests: `src/lib/__tests__/setDiscount.test.ts`,
  `src/lib/__tests__/orderQueryParams.test.ts`, updated order tests.
