/**
 * Centralised client-side history helpers.
 *
 * Astro's `<ClientRouter />` stores its own state object on `history.state`
 * (`{ index, scrollX, scrollY }`); a raw `history.pushState`/`replaceState`
 * replaces it and breaks the browser Back/Forward buttons (scroll
 * restoration, view transitions). These helpers preserve it. Direct
 * `history.*State` is banned by ESLint (`no-restricted-syntax`, see
 * `eslint/history-state.ts`).
 *
 * These only rewrite the current page's address bar — to go to a different
 * page use `navigate` from `astro:transitions/client`.
 */

/** Replace the current history entry's URL (no new back-stack entry). */
export function replaceUrl(url: string | URL): void {
  history.replaceState(history.state, "", url);
}

/** Push a new history entry (adds a back-stack entry). */
export function pushUrl(url: string | URL): void {
  history.pushState(history.state, "", url);
}
