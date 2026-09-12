# Babasarok Website

A catalogue and ordering site for handmade baby products. Products are CMS
content; ordering happens per product page into a basket.

## Language

**Product**:
A handmade baby item offered for sale, modelled as one CMS content entry.
_Avoid_: item, SKU

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
