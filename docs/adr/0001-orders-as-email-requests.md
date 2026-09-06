# ADR 0001: Orders are email requests via Web3Forms

- **Status:** accepted
- **Date:** 2026-08 (pre-existing practice, recorded when set support was designed)

## Context

The shop sells handmade, made-to-order baby products. There is no inventory,
no payment gateway, and no backend server: the site is static,
build-time-first, with Svelte islands for the little interactivity that is
needed. "Placing an order" is really requesting a quote/order that the maker
reviews and fulfills manually.

## Decision

An order is submitted by posting a Web3Forms form payload that is delivered as
an email. The payload contains the buyer's contact and delivery details, the
computed order total, and one text block per product (quantity, configured
fields, materials, price breakdown, unit/total price) plus a basket-level
set-discount summary. No order is stored anywhere by the system; the basket
lives only in the buyer's browser.

## Consequences

- Pricing and validation run only in the browser and are *display*-trusted —
  which is why any future backend must recompute price and validation from a
  shared, pure implementation (see ADR 0002).
- There is no order history, no automated fulfillment, and no refunds path in
  the system; everything is handled off-site.
- The email text is part of the user-facing contract: it must stay
  explainable and verifiable by the buyer (e.g. set-discount lines use the
  undiscounted unit price so the total checks out).
- A commerce platform (Stripe, etc.) would replace this decision; the pure
  pricing core keeps that migration possible.
