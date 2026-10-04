# Tracking on this website

What this website records about its visitors, which companies receive it, and
when. Written for customers and marketing colleagues — no technical background
needed.

## The short version

- **Browsing:** every page view is reported to Google and Meta (Facebook).
  Nothing you type anywhere on the site is included.
- **Ordering:** when you submit an order, Google and Meta are told that a
  purchase happened, along with the order total in HUF and the number of items.
  Your personal details are not part of that.
- **Your order itself** (name, email, phone, delivery method and address,
  message, items, total) is sent by email through a form service called
  Web3Forms. That is the only place your personal data goes.
- There is no cookie banner: tracking is on by default for every visitor.
- We don't run our own analytics software; tracking is handled entirely by
  Google Tag Manager and the Meta (Facebook) Pixel.

## Who receives what

| Recipient                   | What they receive                                                                                                                                                                | When                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Google (Google Ads)         | Page views (`PageView`); on an order: a `conversion` event with the order total in HUF and standard ad identifiers, plus form begin/submit signals                               | Every page; on a submitted order     |
| Meta (Facebook)             | Page views (`PageView`); on an order: a `Purchase` event with the order total in HUF and the item count                                                                          | Every page; on a submitted order     |
| Google & Meta (form events) | How the order form is built — button text, field labels (e.g. `Név *`, `Email cím *`, `Telefonszám`) and input types — but never what anyone typed                               | Automatically, around the order form |
| Web3Forms (email service)   | The full order: name, email, phone, delivery method and address, message, per-item breakdown, total, plus an order reference that lets us match the order with its ad conversion | Only when you submit an order        |

## Cookies set by tracking

- Meta's `fbp` cookie — identifies your browser to Facebook.
- Google Ads cookies: `auid`, `gcl_ctr`, and `_ga_*` cookies if GA4 is switched
  on.

On the live site these are real, per-visitor identifiers, which lets Google and
Meta match your visit across other websites. (On a developer's local test copy
they are dummy values.)

## Privacy in short

- Your personal data (name, email, phone, delivery address) goes only to the
  email service that delivers your order to us — never to Google or Meta.
- Tracking events never contain what you typed into forms — at most the form's
  structure: button text, field labels and input types.
- Order-related tracking only fires when an order form is submitted with valid
  data; normal browsing sends nothing beyond the page view.
- Besides the events we send, Google and Meta also collect data through their
  own tools on their own terms; their privacy policies apply.
- There is currently no cookie or consent banner on the site, so every visitor
  is tracked by default.
