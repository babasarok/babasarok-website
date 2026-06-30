import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * Routes that mount a Svelte client island (`<astro-island>`). The order form on
 * /contact is currently the only one — add new island-bearing routes here as
 * they appear so they get the same hydration guarantee.
 */
const ISLAND_ROUTES = ["/contact"];

/**
 * Console / page-error text that signals a *hydration* failure specifically, so
 * unrelated third-party noise (Meta Pixel, web3forms, etc.) doesn't flake the
 * test. Astro logs `[astro-island] Error hydrating …` and `[hydrate] Error
 * parsing props …`; a non-revivable prop throws `… is not iterable`; Svelte
 * logs hydration mismatches.
 */
const HYDRATION_ERROR = /\[astro-island\]|\[hydrate\]|hydration|is not iterable/i;

test.describe("Svelte island hydration", () => {
  for (const route of ISLAND_ROUTES) {
    test(`hydrates without errors: ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg: ConsoleMessage) => {
        if (msg.type() === "error") {
          errors.push(msg.text());
        }
      });
      page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

      // astro-island dispatches a cancelable `astro:hydration-error` event before
      // it console.errors; surface it through the console channel for diagnostics.
      await page.addInitScript(() => {
        addEventListener("astro:hydration-error", (event) => {
          const detail = (event as CustomEvent).detail as
            { error?: { message?: string } } | undefined;
          console.error(
            `[astro-island] hydration-error: ${detail?.error?.message ?? "unknown error"}`
          );
        });
      });

      await page.goto(route, { waitUntil: "load" });

      // Sanity: the page actually ships an island to hydrate, otherwise this test
      // would pass vacuously if the form were ever removed/renamed.
      await expect(
        page.locator("astro-island").first(),
        `no <astro-island> found on ${route} — nothing to hydrate`
      ).toBeAttached();

      // General success signal: Astro removes the `ssr` attribute in `hydrate()`
      // only *after* the client component mounts. Any hydration throw (bad props,
      // runtime error, mismatch, …) leaves `ssr` in place, regardless of cause.
      await expect
        .poll(() => page.locator("astro-island[ssr]").count(), {
          message: `an <astro-island> on ${route} never finished hydrating (still has [ssr])`,
          timeout: 10_000,
        })
        .toBe(0);

      const hydrationErrors = errors.filter((entry) => HYDRATION_ERROR.test(entry));
      expect(
        hydrationErrors,
        `hydration errors on ${route}:\n${hydrationErrors.join("\n")}`
      ).toEqual([]);
    });
  }
});
