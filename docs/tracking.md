# User tracking

What the site sends to third-party analytics/ad networks, which events fire,
and what data each event carries. This is the authoritative record of the
marketing/analytics integration, cross-checked against a real local capture
(`~/Downloads/localhost.har`) of a full pass of the site including a purchase.

> Conventions and priorities live in [AGENTS.md](../AGENTS.md). The behavior this
> builds on — order submission and when a conversion is recorded — is specified
> in [order submission](specs/order-submission.md).

## 1. Overview

There is no self-hosted analytics (no Plausible/Umami/Matomo, no cookie wall).
All tracking is done client-side by two platforms, both loaded on **every page**
through the base layout:

| Platform | Role | Loaded from | Where it fires |
| ---- | ---- | ---- | ---- |
| **Google Tag Manager (GTM)** | Container that runs the Google Ads conversion tag (and form auto-events) | `googletagmanager.com/gtm.js` | Every page; conversion + form events on the checkout form |
| **Meta (Facebook) Pixel** | Page views, form-interaction events, and purchase events | `connect.facebook.net/en_US/fbevents.js` | Every page (`PageView`); on checkout submit (`Purchase` + form events) |
| **Web3Forms** | Not a tracker — the order-email transport | `web3forms.com/client/script.js` (+ `api.web3forms.com/submit`) | Only on order submit |

One public client env var controls the Google side
([astro.config.ts](../astro.config.ts), [`.env.example`](../.env.example)):

- `GTM_ID` — the **Google Tag Manager container** (a `GTM-…` id) loaded on every
  page. GA4 and the Google Ads conversion tag are configured *inside* that
  container, not as separate snippets in the site.

A minimal `gtag()` shim is defined once in the base layout
([src/layouts/Base.astro](../src/layouts/Base.astro)) so `gtag('event', …)` calls
push onto the shared `dataLayer` that GTM drains. The `@digi4care/astro-google-tagmanager`
integration emits both the inline container snippet and a `<noscript>` fallback.

The site loads no Google Analytics (GA4) snippet and no first-party pixel of its
own — GA4, like the Ads conversion, lives inside the Tag Manager container when
enabled. Everything below describes the events the site is responsible for.

## 2. Where each piece is wired

- **GTM container** — `Base.astro` head: `<GoogleTagmanager id={GTM_ID} />` plus the
  `gtag` shim and `<GoogleTagmanagerNoscript>` in `<body>`.
- **Meta Pixel** — [src/components/MetaPixel.astro](../src/components/MetaPixel.astro),
  rendered in `Base.astro` head. Initializes the pixel and fires `PageView` inline.
  Its `<noscript>` fallback fires `PageView` via an `<img>` beacon when JS is off.
- **Web3Forms** — inline `<script src="https://web3forms.com/client/script.js">` in
  `Base.astro`; the order payload is built in [src/lib/order/submit.ts](../src/lib/order/submit.ts).
- **Purchase / conversion events** — fired by the checkout island
  [src/components/blocks/order/CheckoutForm.svelte](../src/components/blocks/order/CheckoutForm.svelte)
  `onSubmit`.

## 3. Events and the data they send

### 3.1 Meta Pixel

| Event | When | Data sent |
| ---- | ---- | ---- |
| `PageView` | Every page load (JS) **and** `<noscript>` fallback | Page + referrer URL, viewport, locale, title, `fbp` browser-identity cookie |
| `Purchase` | On a submitting valid checkout form | `cd[value]` = order total in **HUF**, `cd[num_items]` = line count, `cd[currency]=HUF`, page/referrer, `fbp` |
| Form-interaction auto-events (e.g. `SubscribedButtonClick`) | Fired automatically by the Pixel against the checkout form | **Form structure only** — see note below |

The Pixel sends **no PII values**. The form-interaction events carry the form's
*shape*, not its contents: button text (e.g. `Küldöm a rendelést!`), field
placeholders (`Név *`, `Email cím *`, `Telefonszám`), input types (`text`/`email`/
`tel`/`radio`/`textarea`) and the page title. The placeholder text reveals the
purpose of each field, but not what a visitor typed. Actual name/email/phone are
sent only to Web3Forms (next section).

### 3.2 Google (via GTM)

The GTM container carries the **Google Ads conversion** tag, triggered by the
checkout form. On a submitting valid form the site pushes a conversion event onto
the shared data layer, and the container's tag reports to Google Ads
(account `18452560426`):

| Event | When | Data sent |
| ---- | ---- | ---- |
| `conversion` (pagead/viewthrough) | On a submitting valid checkout form | `value` = order total in **HUF**, `currency_code=HUF`, the tag's conversion `label`, plus Google's auto-appended `auid`, viewport, url/referrer, `gcl_ctr` |
| `form_begin` / `form_submit` (form auto-events) | Same submit moment | Same url/referrer + `value`; Google's lead-form begin/complete signals, used for form-funnel attribution |
| Retargeting / `1p-user-list`, `1p-conversion` | Same submit moment | Cookieless conversion mirrors served from `www.google.com` **and** `www.google.co.uk` |

The site pushes this as a `gtag('event', 'conversion', …)` call onto the shared
data layer on submit; the conversion id itself lives in the container's tag
configuration (**no `AW-…` id in the codebase**). `transaction_id` in that call
matches the email payload so the conversion reconciles against the Web3Forms
submission.

### 3.3 Web3Forms (order transport, not tracking)

On order submit the buyer's details are POSTed to `api.web3forms.com/submit` as
`FormData`: name, email, phone, delivery method (+ address when required),
message, the per-product breakdown, the computed total, and — as the **last
payload field** — `tranzakcio_id`, the transaction identifier shared with the
Google Ads conversion event. This is the only place the PII leaves the browser.
In the current code the purchase is a disabled dry run (see §5): the `submitOrder`
call is commented out, so **no `/submit` request goes out** while the conversion
events still fire.

## 4. Per-purchase event timeline (from the capture)

All times are the seconds after first page load; purchase submit lands at ~23s.

| t | Platform | Event | value |
| ---- | ---- | ---- | ---- |
| 0–3s | Meta | `PageView` ×N (one per navigation: `/`, `/product/…`, `/product/`, `/checkout`) | — |
| ~23s | Meta | `Purchase` | `21500`, 2 items |
| ~23s | Meta | form-interaction event (`SubscribedButtonClick`) | form shape |
| ~23s | Google | `conversion` (pagead + viewthrough) | `21500` |
| ~23s | Google | `form_begin` / `form_submit` | `21500` |
| ~23s | Google | `1p-user-list` / `1p-conversion` (retargeting, `.com` + `.co.uk`) | — |

No tracking call fires on ordinary browsing beyond Meta `PageView`; the
`form_begin`/`form_submit`/`conversion`/`Purchase` cluster is gated behind a
**valid** checkout submission.

## 5. Known current-state gaps (intended vs. observed)

The normative behavior is [order submission § Conversion tracking](specs/order-submission.md):
a conversion is recorded **only when Web3Forms accepts** the submission, carrying
the order total and the *same* transaction id that closed the email. Remaining
deviations:

- **The purchase is currently disabled at the source (dry run).** In
  `CheckoutForm.svelte` the `submitOrder(...)` call and the `if (!result.ok)`
  guard are commented out. The order email is not sent, but the
  `fbq('track', 'Purchase')` and `gtag('event', 'conversion', …)` calls still run
  — so **a conversion is recorded on any valid form submit**, not on a confirmed
  Web3Forms acceptance (contrary to the spec). Once it's re-enabled the
  conversion will carry the same per-attempt `randomUUID()` as the email's
  `tranzakcio_id`.
- **`orderBasket.clear()`** is also commented out, so a submitted order stays in
  the basket locally.

Net effect today: purchases are *not* actually sent (Web3Forms disabled), but
both ad networks are told a purchase of the real order value happened. This is the
correct "dry run" state for validating the tracking wiring and must not be shipped
as-is.

## 6. Privacy notes

- **PII** (name, email, phone, delivery address) goes only to Web3Forms. It is not
  included in the Google or Meta events; Meta's form events contain field
  placeholders/types (field *purpose*) but not entered values.
- **First-party cookies set:** Meta's `fbp` (browser identity), Google's Ads
  cookies (`auid`, `gcl_ctr`, `_ga_*` if a GA4 stream is enabled).
- On `localhost`, identifiers resolve to loopback (`auid`, `fbp` = local); on
  production these become real per-visitor identifiers and enable cross-site
  matching. A cookie/consent banner is **not** present — every visitor is
  tracked by default.
- Two external parties receive first-party tracking data (Google, Meta); both
  also run their own auto-collected form events independent of the code above.

## 7. Endpoints

```
www.googletagmanager.com/gtm.js                        # Google Tag Manager container (GTM_ID)
connect.facebook.net/en_US/fbevents.js                # Meta Pixel
connect.facebook.net/signals/config/<pixel_id>        # Meta config
www.facebook.com/tr/?id=<pixel>&ev=PageView|Purchase  # Meta events (GET)
www.facebook.com/tr?id=<pixel>&ev=PageView&noscript=1 # Meta noscript fallback
www.facebook.com/tr/                                 # Meta event POSTs
www.googleadservices.com/pagead/conversion/<aid>/     # Google conversion (GET)
www.googleadservices.com/ccm/conversion/<aid>/        # Google conversion (GET)
googleads.g.doubleclick.net/pagead/viewthrough…       # view-through + final POST
www.google.com/{ccm,pagead}/form-data/<aid>           # Google form data
www.google.com/rmkt/collect/<aid>/                    # Google retargeting
{www,co.uk}.google.{com,uk}/pagead/1p-{user-list,conversion}/  # cookieless mirrors
web3forms.com/client/script.js                        # Web3Forms client (no /submit while purchase is disabled)
```
