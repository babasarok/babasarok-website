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
A named collection of products that earns a set discount when bought together.
Membership is declared on the set, not on the products.
_Avoid_: group, bundle

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
