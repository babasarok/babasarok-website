# product-catalog

## MODIFIED Requirements

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

## ADDED Requirements

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
(including embroidery enablement, thread color, and custom color), and
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
