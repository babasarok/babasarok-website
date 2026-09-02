# product-catalog

## Purpose

Catalogue of handmade baby products that buyers can browse. Products are managed
as CMS content, each optionally carrying configurable fields (options,
embroidery) and material slots, and are listed on paginated catalog pages with a
detail page per product.

## Requirements

### Requirement: Product content model

The system SHALL model each product as CMS content carrying at least: an
identifier (`product_id`), title, short description, body content, images
(thumbnail plus optional gallery entries with descriptions), a base price, a
`can_be_ordered` flag, and optional pricing/discount data.

#### Scenario: Product with configurable options

- **WHEN** a product defines configurable fields (radios, selects, toggles,
  colors, free inputs, embroidery) with per-option prices
- **THEN** the product's shape includes those fields with their labels, types,
  options and prices so the order form can render and price them

#### Scenario: Product with material slots

- **WHEN** a product requires materials
- **THEN** the product's shape includes the required material count and the
  available material choices so the order form can collect one material (and
  colors) per required slot

### Requirement: Product catalog list

The system SHALL provide a paginated catalog list of products, newest first,
each entry linking to the product detail page.

#### Scenario: Browsing the catalogue

- **WHEN** a visitor opens the product list
- **THEN** they see the most recently added products first, with pagination
  available beyond the first page

### Requirement: Product detail page

The system SHALL render a detail page per product showing its title, an image
gallery (thumbnail plus gallery images with descriptions), its body content,
and sharing links to social networks. For orderable products the page SHALL
additionally embed an order configurator for that product.

#### Scenario: Viewing a product

- **WHEN** a visitor opens a product's detail page
- **THEN** the page shows the gallery, the description content, and share
  links built from the product's canonical URL

#### Scenario: Viewing an orderable product

- **WHEN** a visitor opens the detail page of a product that can be ordered
- **THEN** the page embeds an order configurator for that product alongside
  the gallery

### Requirement: Product configurator fields

The system SHALL support configurable product fields of the types radio,
select, toggle, color, free input, and embroidery. Fields may carry prices
(additional cost when selected/enabled; embroidery priced per word or flat),
and a field's visibility MAY depend on another field's value (`depends_on`);
fields hidden by an unmet condition MUST NOT contribute to the price or to the
order.

#### Scenario: Conditional field

- **WHEN** a field depends on another field that is not selected
- **THEN** the field is not visible and does not affect the item's price or the
  submitted order

#### Scenario: Embroidery option

- **WHEN** a buyer enables an embroidery field with text and a thread color
- **THEN** the embroidery contributes its price (per word or flat) to the item
  price and the text with the resolved color label appear in the order

### Requirement: Product availability for ordering

The system SHALL expose only products whose `can_be_ordered` flag is set to
the ordering UI; other products are browse-only.

#### Scenario: Non-orderable product

- **WHEN** a product's `can_be_ordered` flag is not set
- **THEN** the product is not offered as an option in the order form

### Requirement: Product page order configurator

The product page configurator SHALL let the buyer set the quantity, choose
field options and materials, see the live item price (including any set
discount status), add the line to the basket, and add related set members.
It SHALL surface the item's set status (active discount, pending partner,
pending material with one-click sync) per the product-sets capability.

#### Scenario: Adding to the basket from the product page

- **WHEN** a buyer configures a product on its page and adds it
- **THEN** the basket gains the line and the nav basket reflects the new
  count

#### Scenario: Adding a related set member

- **WHEN** a buyer is configuring a set member and another member of the same
  set is suggested
- **THEN** the buyer can add the related member without leaving the page

### Requirement: Product page deep links

The product page configurator SHALL support prefilling a new line from URL
query parameters: quantity (`count`), field values keyed by field name
(including embroidery enablement and thread color), and
material selections per slot. Prefilled values SHALL be validated against the
product's options like normal selections.

#### Scenario: Deep link with preselected options

- **WHEN** a visitor opens a product page whose URL query prefills options and
  materials
- **THEN** the configurator starts with those selections and the computed
  price

#### Scenario: Unknown or invalid prefilled values

- **WHEN** a query parameter references an unknown field, option, or material
- **THEN** it is ignored and the configurator starts unselected for that part
