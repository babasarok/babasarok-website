/// <reference types="gtag.js" />

declare global {
  interface Window {
    /** Shared GTM queue; the `gtag` shim in Base.astro owns it. */
    dataLayer?: unknown[];
    /** Meta Connect Pixel, installed by fbevents.js after successful load. */
    fbq?: (event: string, ...params: unknown[]) => void;
  }
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
