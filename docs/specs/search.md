# Site search

Site-wide search over the static build, powered by Pagefind (indexed at build
time by the astro-pagefind integration, searched client-side). Opened from a
search icon button in the header navigation, placed before the basket button
on every breakpoint.

## Requirements

### Search index

The system SHALL index the static HTML output as part of every build. Only
page content is indexed:

- **Scenario: Content-only indexing**
  - WHEN the search index is built
  - THEN only the page's content area (`#content`) is indexed, so navigation,
    header, and footer text never match queries or appear in results
- **Scenario: CMS scaffolding excluded**
  - WHEN the build output contains the TinaCMS admin pages
  - THEN those pages are not indexed (they carry no content area)
- **Scenario: Listing grids excluded**
  - WHEN pages list products as cards (product list, home page, material
    pages)
  - THEN the card titles (product names) are not indexed from those pages, so
    only the product detail page ranks for its own name

### Product result ranking

The system SHALL always show product pages above every other result:

- **Scenario: Product query**
  - WHEN a query matches at least one product page (section `Termékek`)
  - THEN those pages appear first in the result list, keeping their relative
    relevance order, and all non-product pages follow in their own relative
    relevance order

The product pages' `<h1>` additionally carries `data-pagefind-weight="10"`, so
name matches dominate within each ordering.

### Section tagging

The system SHALL tag each page of the site with its section as page-level
metadata (`data-pagefind-meta="section:..."` in the base layout): `Termékek`
(`/product`), `Referenciamunkák` (`/blog`), `Anyagok` (`/material`), `Főoldal`
(`/`); other pages carry no section.

- **Scenario: Result section label**
  - WHEN a result has a section tag
  - THEN its section name is displayed on the result's row in the search
    dialog

### Search UI

The system SHALL provide a search dialog from the navigation:

- **Scenario: Opening and closing**
  - WHEN the visitor activates the search icon button
  - THEN a modal search dialog opens (native `<dialog>` via Invoker Commands,
    no framework JS), focuses the search input, and closes on the close
    button, Escape, or — where the browser supports `closedby="any"` — a
    click outside the dialog
- **Scenario: Searching**
  - WHEN the visitor types a query
  - THEN matching pages appear with title and excerpt (Pagefind's search API,
    rendered by our own layout), linking to the page; the two nav dialogs
    (mobile, desktop) keep independent state; while a query is pending, the
    summary line announces progress politely to screen readers
- **Scenario: No build output yet**
  - WHEN the dev server runs before the first production build
  - THEN searching shows an unavailable message (the `/pagefind/` bundle only
    exists after a build); run `npm run build:local` once to enable it
