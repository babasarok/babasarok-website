# Consent-gated tracking

Lets visitors decide whether measurement tools may run: Google Analytics /
Google Ads (loaded via Google Tag Manager) and the Meta Pixel. No measurement
script is part of the initial document; both load only after an explicit
marketing consent, stored per browser.

## Requirements

### Consent banner

The system SHALL show a consent banner on every page until the visitor has
made a choice, with a link to the privacy page (`/adatvedelem`,
"Részletek"). The choice SHALL be stored in `localStorage` under the key
`dataProtectionConsent` as `{ marketing: boolean, at: ISO timestamp }`. An
absent, malformed, or unreadable stored value SHALL be treated as "no
decision".

- **Scenario: First visit**
  - WHEN a visitor with no stored decision opens any page
  - THEN the consent banner is shown
- **Scenario: Accept**
  - WHEN the visitor accepts marketing consent
  - THEN the choice is stored and the GTM container and the Meta Pixel start
    loading immediately on the current page
- **Scenario: Reject**
  - WHEN the visitor rejects marketing consent
  - THEN the choice is stored, nothing is loaded, and the banner stays closed
    on later pages
- **Scenario: Storage unavailable**
  - WHEN `localStorage` is unavailable (e.g. private mode)
  - THEN the choice applies to the current page load only and no error is
    shown

### Changing the decision

The privacy page (`/adatvedelem`) SHALL offer a button that re-opens the
consent banner.

- **Scenario: Withdrawal**
  - WHEN a visitor who previously accepted rejects via the reopened banner
  - THEN the page reloads once so the already-loaded trackers are unloaded,
    and the banner does not re-open after the reload
- **Scenario: Accept after rejection**
  - WHEN a visitor who previously rejected accepts via the reopened banner
  - THEN the trackers start loading without a reload

### Gated loading

The system SHALL load the GTM container (`gtm.js`) and the Meta Pixel
(`fbevents.js`) only after marketing consent, at most once per page load, and
SHALL keep the `virtualPageview` data-layer push on every client-side
(`astro:after-swap`) navigation so GA4 pageview tracking covers soft
navigations.

- **Scenario: No consent, no requests**
  - WHEN a visitor without marketing consent browses the site
  - THEN no request is made to `googletagmanager.com`,
    `connect.facebook.net`, or `www.facebook.com`
- **Scenario: Consent across client-side navigations**
  - WHEN a consenting visitor navigates within the site via the client-side
    router
  - THEN the trackers keep running and a `virtualPageview` is pushed for each
    navigation

### Conversion events

When Web3Forms accepts a submission, the system SHALL push a Google Ads
conversion into the data layer (order total in HUF and the submission's
transaction identifier, see the order-submission spec), and SHALL send a Meta
`Purchase` event with the same total (`currency: "HUF"`, `value`,
`num_items`) when the pixel is loaded.

- **Scenario: Purchase event without a loaded pixel**
  - WHEN the submission succeeds but the Meta Pixel never loaded (no consent
    or blocked by the visitor)
  - THEN no `Purchase` event is sent and the submission succeeds regardless
- **Scenario: Submission failure**
  - WHEN Web3Forms rejects the submission
  - THEN no conversion event is recorded

### Privacy page content

The privacy page SHALL render its body from the `adatvedelem` CMS collection,
and SHALL render section 1 (the data controller's address, phone, and email)
from the site config so the contact page, footer, and privacy notice share
one source.

- **Scenario: Address change in the CMS**
  - WHEN the editor updates the site address in Tina
  - THEN the privacy page's section 1 shows the new address on the next build
    without a content edit
