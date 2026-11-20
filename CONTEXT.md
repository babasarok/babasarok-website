# Babasarok Website

A catalogue and ordering site for handmade baby products. Products live in
Vendure (edited in the stock dashboard); ordering happens per product page
into a basket.

## Language

**Product**:
A handmade baby item offered for sale, stored in Vendure and edited in the
dashboard. Every product is either a configurator product or a ready-made
product (see below).
_Avoid_: item, SKU

**Configurator product**:
A product the buyer assembles from **configurable fields** (size, material,
embroidery, …) before ordering. The choices are made fresh on each order;
the product itself offers no selectable variants.
_Avoid_: variant product

**Ready-made product**:
A product managed entirely in the dashboard without a configurator
definition; it carries stock. It is either single-variant (ordered as-is)
or has **option groups** whose variants the owner defines. A ready-made
product hides itself only when every variant is sold out.
_Avoid_: native product, custom product

**Option group**:
A buyer-selectable axis of a ready-made product (e.g. size); the chosen
combination of options across groups selects one variant.
_Avoid_: configurable field (that is the configurator's priced field),
attribute

**Variant**:
One purchasable form of a product, with its own price and stock. Ready-made
products are ordered by variant; a configurator product has exactly one.
_Avoid_: SKU, option

**Product type**:
The single classification a product belongs to (e.g. rácsvédő, takaró, lepedő,
párna, babafészek, zsák, kiegészítő). Used to group and filter the product
list. One value per product.
_Avoid_: category (the frontmatter field named `categories` is not this)

**Tagline**:
A short free-text marketing subtitle displayed on the product card (e.g. "A
tökéletes megoldás a forró napokra"). Purely presentational; not a
classification.
_Avoid_: category, subtitle-as-taxonomy

**Product set**:
A named collection of products that earns a **fixed-forint set discount** when
bought together as a set instance. The discount is a flat amount per formed
instance, not a percentage. Membership is declared on the set, not on the
products. A collection whose discount is `0` or absent is not a set — it is
_Related items_ (see below).
_Avoid_: group, bundle

**Set instance**:
One unit each of two or more distinct members of the same product set whose
selected materials are pairwise compatible. The flat set discount applies once
per formed instance (clamped so it never exceeds that instance's charged
subtotal).
_Avoid_: bundle, pair

**Basket pricing**:
The resolved pricing of the current basket in one pass: each item's set-discount
status, the formed set instances with their clamped discount amounts, the items
subtotal, and the total set discount. Computed once and read by the checkout
display, the deals panel, and order submission so the price shown always equals
the price charged.
_Avoid_: cart total, price summary

**Related items**:
A product group that grants no discount (`discount_amount` of `0` or absent).
It is a cross-sell only: the members are shown together on the product page as
"Kapcsolódó termékek", never as a set deal and never in the basket's set
discounts section. A product in several such groups shows each group as its own
separate list.
_Avoid_: set, szett, bundle

**Material**:
A fabric a product can be made from (e.g. duplagéz, minky, pamut). Materials
have their own catalogue pages and are chosen per slot during ordering.
_Avoid_: fabric type

**Configurable field**:
A buyer-selectable option on a product (size, color, embroidery, ...) that can
carry a price. Rendered and priced by the order configurator.
_Avoid_: variant, attribute

**Product list**:
The single catalogue page where all non-hidden products can be browsed,
searched, filtered by product type and product set, and sorted.
_Avoid_: product grid, catalog page, index
