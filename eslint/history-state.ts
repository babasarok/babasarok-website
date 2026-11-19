/**
 * ClientRouter history-state guard: raw `history.pushState`/`replaceState`
 * overwrites `history.state`, which Astro's `<ClientRouter />` owns —
 * breaking Back/Forward scroll restoration and view transitions.
 */

const message =
  "A raw pushState/replaceState overwrites history.state, which Astro's <ClientRouter /> owns ({ index, scrollX, scrollY }) — breaking Back/Forward scroll restoration and view transitions. Rewrite the address bar with replaceUrl/pushUrl from @/lib/history instead (they preserve history.state); to navigate to another page use navigate from astro:transitions/client.";

const stateCalls = String.raw`callee.property.name=/^(push|replace)State$/`;

export const historyStateSelectors = [
  `CallExpression[${stateCalls}][callee.object.name='history']`,
  `CallExpression[${stateCalls}][callee.object.object.name='globalThis']`,
].map((selector) => ({ selector, message }));

export const historyStateFiles = ["src/**/*.astro", "src/**/*.svelte", "src/**/*.ts"];

/** The one place allowed to touch the History API: it forwards history.state. */
export const historyStateAllowlist = ["src/lib/history.ts"];
