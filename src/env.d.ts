/// <reference types="gtag.js" />

declare global {
  interface Window {
    /** Shared GTM queue; the `gtag` shim in Base.astro owns it. */
    dataLayer?: unknown[];
    /** Meta Connect Pixel queue shim; fbevents.js processes it on load. */
    fbq?: (event: string, ...params: unknown[]) => void;
    /** fbevents.js identity-checks `fbq === _fbq` to detect foreign installs. */
    _fbq?: (event: string, ...params: unknown[]) => void;
  }
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
