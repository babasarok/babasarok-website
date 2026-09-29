# Product catalog

Catalogue of handmade baby products that buyers can browse. Products are managed
as CMS content, each optionally carrying configurable fields (options,
embroidery) and material slots, and are listed on a single searchable,
filterable product list with a detail page per product.

## Requirements

### Product content model

The system SHALL model each product as CMS content carrying at least: an
identifier (`product_id`), title, a single product type drawn from a fixed
set of classification values, a tagline (free-text subtitle), short
description, body content, images (thumbnail plus optional gallery entries
with descriptions), a base price, a `can_be_ordered` flag, and optional
pricing/discount data.

- **Scenario: Product with configurable options**
  - WHEN a product defines configurable fields (radios, selects, toggles,
    colors, free inputs, embroidery) with per-option prices
  - THEN the product's shape includes those fields with their labels, types,
    options and prices so the order form can render and price them
- **Scenario: Product with material slots**
  - WHEN a product requires materials
  - THEN the product's shape includes the required material count and the
    available material choices so the order form can collect one material (and
    colors) per required slot

### Product list: search, filtering, and sorting

The system SHALL provide a single product list page showing all non-hidden
products (no pagination), each entry linking to the product detail page, with:

- **Text search** over product title and short description.
- **Filtering by product type**: multiple selections within the type
  dimension are OR-combined.
- **Filtering by product set**: a product matches the set filter when it is
  a member of a selected set; multiple set selections are OR-combined.
- **Sorting**: newest first (default) or by name (title, ascending).

The active search text, selected types, selected sets, and sort order SHALL
be expressed in URL query parameters; the page SHALL apply them on load and
update them as the visitor changes the view, so any filtered view is
shareable. Dimensions are AND-combined with each other and with the search
text. When no product matches, the list SHALL show an empty state with a way
to clear the filters. When JavaScript is unavailable, the page SHALL render
the full product list (newest first) with search, filtering, and sorting
inert.

- **Scenario: Browsing the catalogue**
  - WHEN a visitor opens the product list
  - THEN they see all non-hidden products, most recently added first, without
    pagination
- **Scenario: Text search**
  - WHEN a visitor types a search term
  - THEN the list narrows to products whose title or short description
    matches, without a page reload
- **Scenario: Filtering by type**
  - WHEN a visitor selects one or more product types
  - THEN the list shows only products of the selected types, combined with
    any other active dimension
- **Scenario: Filtering by set**
  - WHEN a visitor selects a product set
  - THEN the list shows only the member products of the selected sets
- **Scenario: Sorting by name**
  - WHEN a visitor selects name sorting
  - THEN the list is ordered alphabetically by title, ascending
- **Scenario: Deep link to a filtered view**
  - WHEN a visitor opens a product list URL carrying search, filter, or sort
    parameters
  - THEN the list is displayed with those already applied
- **Scenario: No matching products**
  - WHEN no product matches the active search and filters
  - THEN an empty state is shown with an affordance to clear the filters
- **Scenario: No JavaScript**
  - WHEN the product list is rendered without JavaScript
  - THEN the full product list is shown and search, filtering, and sorting
    are inert

### Product detail page

The system SHALL render a detail page per product showing its title, an image
gallery (thumbnail plus gallery images with descriptions), its body content,
and sharing links to social networks. For orderable products the page SHALL
additionally embed an order configurator for that product.

- **Scenario: Viewing a product**
  - WHEN a visitor opens a product's detail page
  - THEN the page shows the gallery, the description content, and share links
    built from the product's canonical URL
- **Scenario: Viewing an orderable product**
  - WHEN a visitor opens the detail page of a product that can be ordered
  - THEN the page embeds an order configurator for that product alongside the
    gallery

### Product configurator fields

The system SHALL support configurable product fields of the types radio,
select, toggle, color, free input, and embroidery. Fields may carry prices
(additional cost when selected/enabled; embroidery priced per word or flat),
and a field's visibility MAY depend on another field's value (`depends_on`);
fields hidden by an unmet condition MUST NOT contribute to the price or to the
order.

- **Scenario: Conditional field**
  - WHEN a field depends on another field that is not selected
  - THEN the field is not visible and does not affect the item's price or the
    submitted order
- **Scenario: Embroidery option**
  - WHEN a buyer enables an embroidery field with text and a thread color
  - THEN the embroidery contributes its price (per word or flat) to the item
    price and the text with the resolved color label appear in the order

### Product availability for ordering

The system SHALL expose only products whose `can_be_ordered` flag is set to
the ordering UI; other products are browse-only.

- **Scenario: Non-orderable product**
  - WHEN a product's `can_be_ordered` flag is not set
  - THEN the product is not offered as an option in the order form

### Product page order configurator

The product page configurator SHALL let the buyer set the quantity, choose
field options and materials, see the live item price (including any set
discount status), add the line to the basket, and add related set members.
It SHALL surface the item's set status (active discount, pending partner,
pending material with one-click sync) per the product-sets capability.

- **Scenario: Adding to the basket from the product page**
  - WHEN a buyer configures a product on its page and adds it
  - THEN the basket gains the line and the nav basket reflects the new count
- **Scenario: Adding a related set member**
  - WHEN a buyer is configuring a set member and another member of the same
    set is suggested
  - THEN the buyer can add the related member without leaving the page

### Product page deep links

The product page configurator SHALL support prefilling a new line from URL
query parameters: quantity (`count`), field values keyed by field name
(including embroidery enablement and thread color), and material selections
per slot. Prefilled values SHALL be validated against the product's options
like normal selections.

- **Scenario: Deep link with preselected options**
  - WHEN a visitor opens a product page whose URL query prefills options and
    materials
  - THEN the configurator starts with those selections and the computed price
- **Scenario: Unknown or invalid prefilled values**
  - WHEN a query parameter references an unknown field, option, or material
  - THEN it is ignored and the configurator starts unselected for that part
