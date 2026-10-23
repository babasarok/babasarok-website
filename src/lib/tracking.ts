/**
 * Adatvédelmi hozzájárulás: a látogató hozzájárulásának tárolása és a
 * hozzájáruláshoz kötött külső mérések betöltése. A GA4 (analytics) és a
 * Google Ads konverzió (marketing) a Google Tag Manager konténeren keresztül,
 * a Meta-pixel (marketing) külön tölt be. Egyik sem kerül a kezdő dokumentumba,
 * és mindegyik legfeljebb egyszer, csak hozzájárulás után indul.
 */

const CONSENT_STORAGE_KEY = "dataProtectionConsent";

export interface Consent {
  analytics: boolean;
  marketing: boolean;
  /** ISO timestamp, when the choice was made. */
  at: string;
}

export type Choice = Pick<Consent, "analytics" | "marketing">;

/** CustomEvent name: the user asks to make a fresh consent choice. */
export const CONSENT_RESET_EVENT = "babasarok:consent-reset";

/** The site's Meta (Facebook) pixel. */
export const META_PIXEL_ID = "1683952989437942";

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
    return {
      analytics: parsed.analytics ?? parsed.marketing,
      marketing: parsed.marketing,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function saveConsent(consent: Choice): void {
  const value: Consent = { ...consent, at: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Privát mód / tiltott storage: the choice applies to this page load only.
  }
}

export function needsReload(previous: Consent | null, next: Choice): boolean {
  const wasGtm = previous ? previous.analytics || previous.marketing : false;
  const nowGtm = next.analytics || next.marketing;
  const wasMeta = previous ? previous.marketing : false;
  const nowMeta = next.marketing;
  return (wasGtm && !nowGtm) || (wasMeta && !nowMeta);
}

let gtmLoading = false;
let virtualPageViewTracked = false;
let gtmConsent: Choice | null = null;

/**
 * Astro's `<ClientRouter />` does client-side navigations without a full page
 * load, so GTM's automatic pageview only fires on the first load. Mirror the
 * original `astro-google-tagmanager` behaviour: on every client-side swap
 * push a `virtualPageview` to the dataLayer, which the GTM container maps to
 * its GA4 pageview tag. Registered only once, and only after consent.
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

export function loadGtmContainer(containerId: string, consent: Choice): void {
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
