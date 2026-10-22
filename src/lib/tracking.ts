/**
 * Adatvédelmi hozzájárulás: a látogató hozzájárulásának tárolása és a
 * hozzájáruláshoz kötött külső mérések betöltése. A GA4 (analytics) és a
 * Google Ads konverzió (marketing) a Google Tag Manager konténeren keresztül,
 * a Meta-pixel (marketing) külön tölt be. Egyik sem kerül a kezdő dokumentumba,
 * és mindegyik legfeljebb egyszer, csak hozzájárulás után indul.
 */

const CONSENT_STORAGE_KEY = "dataProtectionConsent";

export interface Consent {
  /** GA4 (Google Analytics), Google Tag Manageren keresztül. */
  analytics: boolean;
  /** Google Ads konverzió + Meta-pixel. */
  marketing: boolean;
  /** ISO timestamp, when the choice was made. */
  at: string;
}

export interface Cookie {
  name: string;
  domain: string;
  lifetime: string;
  purpose: string;
}

export interface CookieCategory {
  key: "necessary" | "analytics" | "marketing";
  label: string;
  description: string;
  locked: boolean;
  cookies: Cookie[];
}

/** CustomEvent name: the user asks to make a fresh consent choice. */
export const CONSENT_RESET_EVENT = "babasarok:consent-reset";

/** The site's Meta (Facebook) pixel. */
export const META_PIXEL_ID = "1683952989437942";

/** Stored form; `analytics` is optional because pre-split values lacked it. */
type StoredConsent = { analytics?: boolean; marketing: boolean; at: string };

function isStoredConsent(value: unknown): value is StoredConsent {
  return (
    typeof value === "object" &&
    value !== null &&
    "marketing" in value &&
    typeof value.marketing === "boolean" &&
    "at" in value &&
    typeof value.at === "string"
  );
}

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredConsent(parsed)) {
      return null;
    }
    // Legacy single-flag values treated `marketing` as covering both purposes,
    // so a missing `analytics` migrates to the stored `marketing`.
    return {
      analytics: parsed.analytics ?? parsed.marketing,
      marketing: parsed.marketing,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function saveConsent(consent: Pick<Consent, "analytics" | "marketing">): void {
  const value: Consent = { ...consent, at: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Privát mód / tiltott storage: the choice applies to this page load only.
  }
}

/**
 * Trackers already in memory cannot be unloaded short of a full reload, so a
 * fresh choice only forces one when something loaded under `previous` would no
 * longer be loaded under `next`.
 */
export function needsReload(
  previous: Consent | null,
  next: Pick<Consent, "analytics" | "marketing">,
): boolean {
  const wasGtm = previous ? previous.analytics || previous.marketing : false;
  const nowGtm = next.analytics || next.marketing;
  const wasMeta = previous ? previous.marketing : false;
  const nowMeta = next.marketing;
  return (wasGtm && !nowGtm) || (wasMeta && !nowMeta);
}

let gtmLoading = false;
let virtualPageViewTracked = false;
let gtmConsent: Pick<Consent, "analytics" | "marketing"> | null = null;

/**
 * Astro's `<ClientRouter />` does client-side navigations without a full page
 * load, so GTM's automatic pageview only fires on the first load. Mirror the
 * original `astro-google-tagmanager` behaviour: on every client-side swap
 * push a `virtualPageview` to the dataLayer, which the GTM container maps to
 * its GA4 pageview tag. Registered only once, and only after consent. Each
 * push carries the consent states so the container's tags can gate on them.
 */
function startVirtualPageViewTracking(): void {
  if (virtualPageViewTracked) {
    return;
  }
  virtualPageViewTracked = true;
  globalThis.addEventListener("astro:after-swap", () => {
    (globalThis.window.dataLayer ??= []).push({
      event: "virtualPageview",
      "gtm.start": Date.now(),
      virtualPagePath: globalThis.location.pathname,
      virtualPageTitle: document.title,
      consent: gtmConsent,
    });
  });
}

/**
 * Load the GTM container, carrying the visitor's consent states in the data
 * layer so the container's GA4 tag can gate on `consent.analytics` and its
 * Google Ads conversion tag on `consent.marketing` (see the consent-tracking
 * spec for the required GTM tag triggers). The `gtag` shim in Base.astro owns
 * `window.dataLayer`.
 */
export function loadGtmContainer(
  containerId: string,
  consent: Pick<Consent, "analytics" | "marketing">,
): void {
  if (gtmLoading) {
    return;
  }
  gtmLoading = true;
  gtmConsent = consent;
  (globalThis.window.dataLayer ??= []).push({ "gtm.start": Date.now(), event: "gtm.js", consent });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
  document.head.append(script);
  startVirtualPageViewTracking();
}

let metaPixelLoading = false;

export function loadMetaPixel(pixelId: string): void {
  if (metaPixelLoading) {
    return;
  }
  metaPixelLoading = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  // fbevents.js installs the real `window.fbq` when it executes, so calling
  // it from the load event needs no pre-load queue shim.
  script.addEventListener("load", () => {
    globalThis.window.fbq?.("init", pixelId);
    globalThis.window.fbq?.("track", "PageView");
  });
  document.head.append(script);
}
