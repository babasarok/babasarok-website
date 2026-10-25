# Consent-gated tracking

Lets visitors decide whether measurement tools may run, in two purposes:
**analytics** (Google Analytics / GA4, loaded via Google Tag Manager) and
**marketing** (Google Ads conversion + the Meta Pixel). No measurement script
is part of the initial document; each purpose loads only after an explicit
consent for it, stored per browser.

## Requirements

### Consent banner

The system SHALL show a consent banner on every page until the visitor has made
a choice. The banner offers **Összes elfogadása** (accept all) and
**Beállítások** (open the settings dialog); there is no direct reject on the
banner.

The choice SHALL be stored in `localStorage` under the key
`dataProtectionConsent` as
`{ analytics: boolean, marketing: boolean, at: ISO timestamp }`. A stored
value from before the analytics/marketing split (`{ marketing, at }`, with no
`analytics`) SHALL migrate by treating `analytics` as the stored `marketing`
value. An absent, malformed, or unreadable stored value SHALL be treated as
"no decision".

### Settings dialog

**Beállítások** SHALL open a dialog listing the cookie categories — a locked
_necessary_ category (always on; it is what stores the consent choice), an
_analytics_ toggle, and a _marketing_ toggle — each with an expandable
per-cookie table (name, domain, lifetime). The dialog offers **Mindent
elutasít** (reject all) and **Beállítások mentése** (save the current
toggles). Saving SHALL show a confirmation ("Beállítások mentve").

- **Scenario: First visit**
  - WHEN a visitor with no stored decision opens any page
  - THEN the consent banner is shown
- **Scenario: Accept all**
  - WHEN the visitor clicks "Összes elfogadása"
  - THEN both purposes are stored as consented, the GTM container and the Meta
    Pixel start loading immediately on the current page, and the banner closes
- **Scenario: Reject all**
  - WHEN the visitor opens the settings and clicks "Mindent elutasít"
  - THEN both purposes are stored as not consented, nothing is loaded, and the
    banner stays closed on later pages
- **Scenario: Save a custom choice**
  - WHEN the visitor sets the toggles and clicks "Beállítások mentése"
  - THEN the choice is stored, the confirmation is shown, and the trackers load
    (or, if a loaded tracker is withdrawn, the page reloads) to match it
- **Scenario: Storage unavailable**
  - WHEN `localStorage` is unavailable (e.g. private mode)
  - THEN the choice applies to the current page load only and no error is
    shown

### Changing the decision

The privacy page (`/adatvedelem`) SHALL offer a button that re-opens the
consent banner.

- **Scenario: Withdrawal**
  - WHEN a visitor who previously consented to a purpose withdraws it via the
    reopened settings
  - THEN the page reloads once so the already-loaded tracker is unloaded, and
    the banner does not re-open after the reload
- **Scenario: Accept after rejection**
  - WHEN a visitor who previously rejected a purpose consents to it via the
    reopened settings
  - THEN the tracker starts loading without a reload

### Gated loading

The system SHALL load the GTM container (`gtm.js`) only when
`analytics || marketing` and the Meta Pixel (`fbevents.js`) only when
`marketing`, each at most once per page load. On load, the visitor's consent
states SHALL be pushed to the data layer as
`consent: { analytics: boolean, marketing: boolean }` so the GTM container's
tags can gate on them.

**GTM container requirement (external to this repo):** the container's GA4 tag
SHALL fire only when `consent.analytics` is true, and its Google Ads conversion
tag SHALL fire only when `consent.marketing` is true (e.g. via data-layer
variables wired into each tag's trigger). Until that GTM configuration is in
place, GA4 and the Google Ads conversion run together whenever the container
loads.

The system SHALL keep the `virtualPageview` data-layer push (carrying the
consent states) on every client-side (`astro:after-swap`) navigation so GA4
pageview tracking covers soft navigations.

- **Scenario: No consent, no requests**
  - WHEN a visitor without any consent browses the site
  - THEN no request is made to `googletagmanager.com`,
    `connect.facebook.net`, or `www.facebook.com`
- **Scenario: Consent across client-side navigations**
  - WHEN a consenting visitor navigates within the site via the client-side
    router
  - THEN the trackers keep running and a `virtualPageview` is pushed for each
    navigation

### Conversion events

When the backend accepts an order submission, the system SHALL push a Google
Ads conversion into the data layer (order total in HUF and the submission's
transaction identifier, see the order-submission spec), and SHALL send a Meta
`Purchase` event with the same total (`currency: "HUF"`, `value`,
`num_items`) when the pixel is loaded.

- **Scenario: Purchase event without a loaded pixel**
  - WHEN the submission succeeds but the Meta Pixel never loaded (no consent
    or blocked by the visitor)
  - THEN no `Purchase` event is sent and the submission succeeds regardless
- **Scenario: Submission failure**
  - WHEN the backend rejects the submission
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
