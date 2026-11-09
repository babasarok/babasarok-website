import type { AstroIntegration } from "astro";

/**
 * Starts loading the page locale's i18next resources before any island
 * hydrates, so island `{#await}`s resolve from the already-in-flight
 * instance without a key flash against the server-rendered HTML.
 */
export function i18nPreload(): AstroIntegration {
  return {
    name: "babasarok-i18n-preload",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript("before-hydration", 'import "@/lib/i18n-preload-browser.js";');
      },
    },
  };
}
