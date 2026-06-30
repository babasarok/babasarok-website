# Plan: TinaCMS visual editing on Cloudflare

Status: **draft / proposal** — not yet implemented.

This document explains how the [`tina-astro-starter`](https://github.com/tinacms/tina-astro-starter)
implements visual editing, what our repo would need to adopt it, why a Cloudflare
**adapter is required** for the live experience, and the estimated Cloudflare cost.

## 1. Background: what "visual editing" means here

There are two distinct levels, and they have very different infrastructure needs:

| Level                                                   | What the editor sees                                                                                                           | Infra needed                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **A. Contextual click-to-edit**                         | Hovering the preview highlights regions; clicking opens the right field in the form. Preview updates **after save + rebuild**. | None — works with pure static output.    |
| **B. Live island refetch** (starter's current approach) | Typing in the form updates the preview **instantly**, no save/rebuild, region-by-region.                                       | **An adapter + an on-demand SSR route.** |

The starter ships **level B**, and that is the part that needs an adapter.

## 2. How the starter wires visual editing

Verified against `tinacms/tina-astro-starter@main`:

1. **`output: 'static'` + an adapter.** The starter keeps `output: 'static'` and
   adds `adapter: vercel()`. Almost every page is prerendered to static HTML; the
   adapter exists to serve the one on-demand route below.

2. **`data-tina-field` attributes** mark editable regions (level A):

   ```astro
   ---
   import { tinaField } from "@tinacms/astro/tina-field";
   ---

   <h1 data-tina-field={tinaField(data, "headline")}>{data.headline}</h1>
   ```

3. **`requestWithMetadata()`** wraps every loader so `tinaField()` has the metadata
   it needs when the page renders inside the `/admin` iframe. (Our repo already
   does this — but only for `getConfig`.)

4. **An island registry** — `src/lib/islands.ts` — is the single source of truth
   for every region the editor can live-refresh. Each entry maps a slug to a
   `{ fetch, component, wrapper, propsFromData }`:

   ```ts
   import type { IslandRegistry } from "@tinacms/astro/experimental";
   export const islands: IslandRegistry = {
     page: {
       fetch: (_r, p) => getPage(p.get("slug") ?? "home"),
       component: PageBody,
       wrapper: { tag: "main" },
       propsFromData: (d) => ({ data: d.data?.page }),
     },
     global: {
       fetch: () => getConfig(),
       component: Header,
       wrapper: { tag: "div" },
       propsFromData: (d) => ({ config: d.data?.config }),
     },
     // …blog, global-footer
   };
   ```

5. **An on-demand SSR endpoint** — `src/pages/tina-island/[name].ts` — is what the
   in-iframe bridge calls to re-render a single region with the editor's draft
   content as they type. **This is the route that forces an adapter:**

   ```ts
   import { experimental_createIslandRoute } from "@tinacms/astro/experimental";
   import { islands } from "../../lib/islands";

   export const prerender = false; // ← on-demand SSR; needs an adapter at deploy time
   export const ALL = experimental_createIslandRoute(islands);
   ```

   Public visitors **never hit this route** — they get static HTML. It runs only
   while an editor has the Tina admin open and is typing.

> Correction to an earlier assumption: visual editing as the starter ships it is
> **not** purely static. Level A is static, but the starter's level-B live preview
> depends on the `prerender = false` `/tina-island/[name]` route, which requires an
> adapter.

## 3. Current state of our repo

- `astro.config.ts`: `output: 'static'`, **no adapter**, Tina integration present.
- `src/lib/data.ts`: uses `requestWithMetadata()` for `getConfig` only;
  `getProducts` / `getMaterials` / `getDeliveryMethods` do **not** carry metadata.
- The `resolveTinaImageRefs()` deep-walk rebuilds plain objects, which **strips the
  Tina metadata overlay** — `getConfig` deliberately narrows the walk to avoid this.
  Any entity we want live-editable must preserve that metadata.
- **No `data-tina-field` attributes anywhere** — so even level A is not wired yet.
- No island registry, no `/tina-island` route.

## 4. Proposed approach

Pick one of two options.

### Option A — Static, contextual editing only (no adapter, $0)

Lowest risk; stays 100% static; deployable on Cloudflare Pages as-is.

1. Add `data-tina-field={tinaField(data, '…')}` to the section components
   (`Hero`, `Service`, `About`, `Product`, `Blog`, `Header`/`Footer`).
2. Extend `requestWithMetadata()` to the loaders backing those sections, and make
   `resolveTinaImageRefs()` metadata-preserving (or resolve images a different way
   for editable entities).
3. Editors click a region → the right field focuses; **Save commits to Git →
   Tina Cloud → triggers a rebuild**; preview refreshes on the new deploy.

Trade-off: no instant keystroke preview; editor waits for a rebuild to see the
result in context.

### Option B — Live island refetch (starter parity, needs Cloudflare adapter)

Full live preview. Adopt the starter's experimental pieces:

1. `npm i @astrojs/cloudflare` and set it as the adapter in `astro.config.ts`:

   ```ts
   import cloudflare from "@astrojs/cloudflare";
   export default defineConfig({
     output: "static",
     adapter: cloudflare(),
     // …existing config
   });
   ```

   With `output: 'static'` + an adapter, Astro prerenders everything except routes
   marked `prerender = false`, which it emits as Cloudflare functions.

2. Create `src/lib/islands.ts` (registry) and
   `src/pages/tina-island/[name].ts` (`prerender = false`,
   `experimental_createIslandRoute(islands)`).

3. Wrap each editable section so its markup can be swapped by the bridge, and add
   the `data-tina-field` attributes from Option A.

4. Make the editable loaders metadata-preserving (see §3).

5. Deploy to **Cloudflare Pages** (or Workers) so the `/tina-island/*` function has
   a runtime. Static assets stay free + unlimited; the function runs only during
   editing.

> Note: `@astrojs/cloudflare` runs on the Cloudflare **Workers runtime** (Node
> compat via `nodejs_compat`). `sharp`-based image work happens at **build time**
> (still static output), so the Workers runtime does not need `sharp`. Verify the
> Tina admin (`/admin`, static assets under `public/admin`) and the island route
> both work under `wrangler dev` before shipping.

## 5. Cloudflare cost estimate

Two cost centres: **hosting/serving** and **builds**.

### Serving

| Item                                          | Plan / rate                                                                                                                                         | Our usage                                                                                        | Cost               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| Static assets (the whole public site)         | Cloudflare Pages/Workers: **free, unlimited** requests + bandwidth                                                                                  | All public traffic                                                                               | **$0**             |
| `/tina-island/*` SSR function (Option B only) | Billed as Workers. Free: 100k req/day, **10 ms CPU/invocation**. Paid: $5/mo base, 10M req + 30M CPU-ms included, then $0.30/M req + $0.02/M CPU-ms | Hit **only during editing sessions** by a handful of editors; debounced, bursty, very low volume | **$0**, see caveat |

Caveat: an Astro SSR render of an island can exceed the Free plan's **10 ms
CPU-per-invocation** cap. If island renders trip that limit, move the Worker to the
**Workers Paid** plan ($5/mo), whose Standard model allows far higher CPU per
invocation; the per-request/CPU overage for this tiny editing workload is
effectively **$0** on top of the $5 base.

**Serving total:**

- **Option A:** **$0/month** (pure static on Pages Free).
- **Option B:** **$0/month** if island renders stay under the Free CPU cap;
  **~$5/month** if you adopt Workers Paid for CPU headroom (recommended for a
  reliable editing experience).

### Builds

- Building **on Cloudflare Pages**: Free plan includes **500 builds/month**, 1
  concurrent. Pro ($20/mo) raises this to 5,000 builds + 5 concurrent. A
  low-frequency marketing/content site is comfortably within Free.
- We can also keep building in **GitHub Actions** (current setup) and deploy the
  artifact to Cloudflare, sidestepping Pages build limits entirely.

### Bottom line

| Scenario                                               | Est. monthly Cloudflare cost |
| ------------------------------------------------------ | ---------------------------- |
| Option A (static, click-to-edit)                       | **$0**                       |
| Option B (live preview), Free Workers fits             | **$0**                       |
| Option B (live preview), Workers Paid for CPU headroom | **~$5** (base; overage ≈ $0) |

The only realistic recurring cost is the **$5/mo Workers Paid base fee**, and only
if Option B's SSR island renders need more than the Free plan's 10 ms CPU per
invocation. Static serving and bandwidth are free regardless.

## 6. Recommendation

1. **Start with Option A.** It delivers contextual editing with zero new infra and
   no adapter, and forces us to do the prerequisite work anyway (`data-tina-field`
   wiring + metadata-preserving loaders).
2. **Adopt Option B if editors need instant preview.** Add `@astrojs/cloudflare`,
   the island registry, and the `prerender = false` route, and budget **$5/mo** for
   Workers Paid as a safety margin on SSR CPU.

## 7. Open questions / to verify before committing

- Does `@astrojs/cloudflare` serve the prebuilt Tina admin (`public/admin/**`)
  cleanly alongside the function route? (Smoke-test under `wrangler dev`.)
- Can `resolveTinaImageRefs()` be made metadata-preserving without re-introducing
  the Tina Cloud URL leak that `scripts/test/no-tina-cloud-urls.ts` guards against?
- Where do we build (Cloudflare Pages CI vs existing GitHub Actions) and where do
  the Tina Cloud credentials live for that build?
- Is the `@tinacms/astro/experimental` island API stable enough to depend on, or
  should we pin `@tinacms/astro` and track its changelog?
