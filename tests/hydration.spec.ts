import { test, expect, type ConsoleMessage, type Locator } from "@playwright/test";

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

/**
 * ---------------------------------------------------------------------------
 * Prop-revival diagnostics
 * ---------------------------------------------------------------------------
 * Astro serializes island props to the `props` attribute as nested
 * `[type, value]` tuples and revives them client-side (see
 * node_modules/astro/dist/runtime/server/astro-island.js). The reviver does
 * `const [type, value] = raw` on every node, so if serialization ever puts a
 * *non-array* into a tuple slot, that destructuring throws
 * `"<type> is not iterable"` and the whole island silently fails to hydrate —
 * exactly the failure we keep hitting on the order form.
 *
 * The walker below mirrors astro's `reviveObject`/`reviveTuple`/`reviveArray`
 * but, instead of throwing on the first malformed node, records the JSON path
 * of every offending value so the test can print *which* prop broke.
 */

/** PROP_TYPE ids whose payload is an array the reviver iterates (`raw.map`): */
/**  1 = Array/JSON, 4 = Map entries, 5 = Set entries (astro serialize.ts). */
const ARRAY_PAYLOAD_TYPES = new Set([1, 4, 5]);
/** Every PROP_TYPE id astro knows how to revive (0–11). */
const KNOWN_PROP_TYPES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

interface NonRevivableProp {
  path: string;
  reason: string;
  preview: string;
}

/**
 * Short, safe, one-line preview of a serialized value. Inputs always come from
 * `JSON.parse`, so `JSON.stringify` can't return `undefined` or throw here.
 */
function previewValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * Walk a serialized `props` attribute the same way astro-island revives it and
 * collect every path where revival would throw (a tuple slot that isn't an
 * array, or an array-payload type whose payload isn't an array).
 */
function collectNonRevivableProps(propsAttr: string | null): NonRevivableProp[] {
  if (!propsAttr) {
    return [];
  }

  let root: unknown;
  try {
    root = JSON.parse(propsAttr);
  } catch (err) {
    return [
      {
        path: "props",
        reason: `props attribute is not valid JSON: ${(err as Error).message}`,
        preview: previewValue(propsAttr),
      },
    ];
  }

  const offenders: NonRevivableProp[] = [];

  // Mirrors `reviveTuple`: `raw` must be a `[type, value]` array.
  const walkTuple = (raw: unknown, path: string): void => {
    if (!Array.isArray(raw)) {
      offenders.push({
        path,
        reason:
          `not a [type, value] tuple — astro's \`const [type, value] = raw\` ` +
          `throws "${raw === null ? "null" : typeof raw} is not iterable" here`,
        preview: previewValue(raw),
      });
      return;
    }

    const [type, value] = raw as [unknown, unknown];
    if (typeof type !== "number" || !KNOWN_PROP_TYPES.has(type)) {
      offenders.push({
        path,
        reason: `unknown prop type ${previewValue(type)} (astro would revive this as undefined)`,
        preview: previewValue(value),
      });
      return;
    }

    // type 0 = plain object: every own-property value must itself be a tuple.
    if (type === 0) {
      if (value !== null && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          walkTuple(entry, `${path}.${key}`);
        }
      }
      return;
    }

    // type 1/4/5 = array-ish: astro calls `value.map(reviveTuple)`.
    if (ARRAY_PAYLOAD_TYPES.has(type)) {
      if (!Array.isArray(value)) {
        offenders.push({
          path,
          reason:
            `type ${type} payload must be an array (astro calls \`value.map(...)\`) ` +
            `but got ${value === null ? "null" : typeof value}`,
          preview: previewValue(value),
        });
        return;
      }
      for (const [index, entry] of value.entries()) {
        walkTuple(entry, `${path}[${index}]`);
      }
      return;
    }

    // types 2,3,6–11 revive from a scalar payload — nothing to recurse into.
  };

  // Top level mirrors `reviveObject(JSON.parse(props))`: `{ propName: tuple }`.
  if (root !== null && typeof root === "object" && !Array.isArray(root)) {
    for (const [key, entry] of Object.entries(root)) {
      walkTuple(entry, key);
    }
  } else {
    offenders.push({
      path: "(root)",
      reason: "props root is not a plain object",
      preview: previewValue(root),
    });
  }

  return offenders;
}

/**
 * Read the `props` attribute off every `<astro-island>` and build a
 * human-readable report of the non-revivable prop paths. Returns "" when every
 * island's props revive cleanly. The `props` attribute is emitted at SSR time,
 * so it's present even when a revival throw leaves the island stuck with `ssr`.
 */
async function diagnoseIslandProps(islands: Locator): Promise<string> {
  const propAttrs = await islands.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("props"))
  );

  const sections: string[] = [];
  for (const [index, attr] of propAttrs.entries()) {
    const offenders = collectNonRevivableProps(attr);
    if (offenders.length === 0) {
      continue;
    }

    const lines = offenders.map(
      (o) => `    • ${o.path}\n        ${o.reason}\n        value: ${o.preview}`
    );
    sections.push(
      `  <astro-island>[${index}] — ${offenders.length} non-revivable prop(s):\n${lines.join("\n")}`
    );
  }

  return sections.length
    ? `\n\nOffending island props (break astro hydration):\n${sections.join("\n")}`
    : "";
}

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
      const islands = page.locator("astro-island");
      await expect(
        islands.first(),
        `no <astro-island> found on ${route} — nothing to hydrate`
      ).toBeAttached();

      // Inspect the serialized `props` up front (they're present at SSR time,
      // before hydration runs) and point at any prop that can't be revived. This
      // is what surfaces "TypeError: … is not iterable" as a concrete prop path
      // instead of an opaque island failure.
      const propsDiagnostics = await diagnoseIslandProps(islands);

      // General success signal: Astro removes the `ssr` attribute in `hydrate()`
      // only *after* the client component mounts. Any hydration throw (bad props,
      // runtime error, mismatch, …) leaves `ssr` in place, regardless of cause.
      await expect
        .poll(() => page.locator("astro-island[ssr]").count(), {
          message: `an <astro-island> on ${route} never finished hydrating (still has [ssr])${propsDiagnostics}`,
          timeout: 10_000,
        })
        .toBe(0);

      const hydrationErrors = errors.filter((entry) => HYDRATION_ERROR.test(entry));
      expect(
        hydrationErrors,
        `hydration errors on ${route}:\n${hydrationErrors.join("\n")}${propsDiagnostics}`
      ).toEqual([]);
    });
  }
});
