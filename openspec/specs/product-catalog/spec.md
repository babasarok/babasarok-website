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
and sharing links to social networks.

#### Scenario: Viewing a product

- **WHEN** a visitor opens a product's detail page
- **THEN** the page shows the gallery, the description content, and share
  links built from the product's canonical URL

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
