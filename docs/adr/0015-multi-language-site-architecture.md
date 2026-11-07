# ADR 0015 — Multi-language site architecture (epic 8)

Status: proposed

## Context

Epic 8 brings English to the post-cutover site (and later Slovak, epic 9).
The catalog is already translatable in Vendure (ADR 0011): entity
translations are keyed by `languageCode`, the channel falls back to its
default language when a translation is missing, and the dashboard edits
translations per content language. What remains is the Astro surface, the
non-catalog Tina content, buyer-visible server messages, and order emails.

## Priorities (ranked)

1. **Correctness of the locale contract** — one source of truth for locale;
   every rendered page and every island agrees with the URL.
2. **Cacheability** — pages stay CDN-cacheable end to end. Server islands
   are a last resort, not the default: their props ride an encrypted query
   string (with a POST fallback that defeats caching), so a cached page can
   still trigger per-visitor island fetches. Client islands (props baked
   into the cached page HTML) are the preferred island form.
3. **Build-time and no-JS first** — locale selection happens at build or
   request render, not in the client bundle.
4. **Owner-editable content** — per-locale content stays Tina-editable.
5. **SEO** — self-consistent hreflang, per-locale sitemaps and search.

## Decisions

1. **Path-prefix routing, Hungarian unprefixed.** Astro i18n routing:
   `locales: ["hu", "en"]`, `defaultLocale: "hu"`,
   `routing.prefixDefaultLocale: false`. Hungarian keeps today's URLs (no
   SEO reset); English lives under `/en/…`. Per-locale domains
   (`i18n.domains`) are unavailable — they require full-server output with
   no prerendered pages, which this site's hybrid static/on-demand shape
   violates. Un-translated `/en/` routes fall back to the Hungarian page
   via `i18n.fallback: { en: "hu" }` (redirect) instead of 404 during
   rollout.

2. **Locale is a prop inside islands; no new server islands.** Client
   islands render with the page and receive `locale` and their strings as
   serializable props. Server islands (`server:defer`) resolve `Astro.url`
   to `/_server-islands/…`, so URL-derived locale breaks there — and per
   priority 2 they are a last resort anyway. The one existing server island
   (`PopularProducts`) becomes a client island: it fetches the catalog from
   the browser at runtime, so nothing catalog-shaped is baked at build time
   (the build must not fetch the API) and the homepage stays prerendered.
   No new `server:defer` may be added.

3. **i18next core, typed on both sides.** `src/locales/
{hu,en}.ts` are `as const` TS modules (JSON cannot carry the literal
   types the key checking needs). Every `t()` is typed via the
   `CustomTypeOptions` augmentation from the Hungarian source of truth, so
   an unknown key — or an interpolation variable missing from the string —
   fails `astro check`, not a visitor; `en` additionally `satisfies` a
   recursive key-shape of `hu`, so English cannot silently drop a Hungarian
   key. Server-side, Astro frontmatter resolves strings through a
   per-render `createInstance` (`src/lib/i18next.ts`; a shared mutable
   instance is racy under concurrent on-demand requests). Client islands
   use i18next directly (`src/lib/i18next-client.ts`): one instance per
   language, resources loaded lazily per language through
   `i18next-resources-to-backend` over dynamic imports of the same TS
   resource modules (single source, per-locale chunks, no JSON
   duplication); islands wrap their content in `I18nGate`
   (`src/components/ui/I18nGate.svelte`) — one `{#await}` of the shared
   instance per island, strings accessed inline as `t(...)` inside the
   gated snippet — and a `before-hydration` integration script
   (`integrations/i18n-preload.ts`) pre-loads the page locale so
   hydration matches the server-rendered HTML without a key flash.
   Locale switching is a page navigation, so no reactive language store is
   needed (`svelte-i18next` is stale since 2023-10 and rejected). Islands
   must import the client module only via `@/lib/i18next-client` — module
   dedup (one i18next instance per page) depends on it and is covered by a
   cross-specifier test. Vendure `ErrorCode` → message maps live in the
   same resources, keyed by the stable error codes the server returns.
   Community Astro integrations were rejected with evidence:
   `astro-i18next` (beta, last publish 2023-03) and
   `@gutenye/astro-i18next` (alive, but it imposes its own
   `getStaticPaths`-based `[...locale]` routing that conflicts with
   Astro-native i18n and the on-demand catalog routes, and its JSON-file
   pattern forfeits the type safety). Key hygiene is the official
   i18next-cli (key extraction, locale syncing, linting). i18next is
   already the shop backend's translation framework (Vendure), so one
   library spans both seams.

4. **Tina content: directory-based localization.** Per the official Tina
   i18n guide (directory-based is recommended for markdown bodies), locale
   becomes a path segment under each collection root
   (`src/content/<collection>/<locale>/…`), one Tina collection per content
   type, locale derived from the document path; translators duplicate an
   existing document into the target locale folder. The global `config`
   file becomes per-locale too (menus, titles and contact strings differ
   per language; theme/logo duplication is an accepted trade-off). Product
   and material content stays in Vendure — it must not return to Tina
   (roadmap principle).

5. **Vendure speaks the page's language, explicitly.** Every shop-API
   request carries `?languageCode=` mapped from the locale (`hu`, `en` —
   both present in Vendure's `LanguageCode` enum) AND sets the
   `Accept-Language` header to the same locale: Vendure resolves its own
   text (error messages) by `Accept-Language` first, then `languageCode`,
   so a browser client relying on `languageCode` alone gets its OS locale.
   Buyer-visible server messages are translated server-side (per-language
   tables; the site renders what the server returns); the site-side
   `ErrorCode` maps are per-locale dictionaries.

6. **hreflang by sitemap, once.** Google treats HTML, HTTP-header and
   sitemap annotations as equivalent and advises picking one; this site
   picks the sitemap: the integration's `i18n` option annotates prerendered
   pages, and `sitemap-catalog.xml` gains `xhtml:link` alternates for the
   on-demand catalog pages. Every variant lists itself plus all others
   (bidirectional return links, fully-qualified URLs). `<html lang>` is
   still set per page — Pagefind reads it to split search indexes per
   language (hu and en both have UI translations and stemming), and
   `og:locale` follows the page locale.

7. **On-demand cache rules mirror per locale.** Route rules use
   file-routing patterns and support no globs, so every on-demand route
   carries an explicit `/en/…` mirror rule.

8. **Prices stay HUF** in English; currency work is epic 9's scope and
   stays uncoupled.

## Options considered

- **Do nothing / not now** (Hungarian-only until epic 9): rejected — the
  owner requirement is explicit and the catalog already carries the cost.
- **Field-based Tina localization** (one file holding every language):
  rejected — the Tina guide recommends directory-based for markdown-body
  content.
- **Server islands for localized dynamic surfaces**: rejected (priority 2)
  — encrypted-query props and the POST fallback make CDN caching
  unreliable.
- **`i18n.domains`** (per-language domains): rejected — requires server
  output with no prerendered pages.

## Rollout plan

Slices, in merge order:

1. **Foundation** (this ADR): `src/lib/i18n.ts` (locale type, pathname
   helpers — client-safe, no i18next import) and `src/lib/i18next.ts` (the
   server-side typed `createInstance`; islands never import it), astro
   config i18n + fallback + sitemap i18n + mirrored route rules,
   `Base.astro` `lang`/`og:locale`.
2. **Routing & SEO**: language switcher, catalog-sitemap alternates,
   per-locale search index, PopularProducts as a client island (see
   decision 2).
3. **UI dictionaries**: `src/locales/*`, string extraction across pages,
   blocks and islands, `/en/` page mirrors, en 404/500.
4. **Tina per-locale content**: locale subfolders, collection/config
   updates, English drafts (legal texts owner-reviewed before publish).
5. **Backend language plumbing**: languageCode + Accept-Language per
   request, per-language message tables, per-locale order emails.

No data migration: content files move under locale folders inside the Tina
git repo; the Tina editor must still resolve moved documents (verify before
merge). Every slice keeps `astro check`, eslint, svelte-check and the
Vitest suites green. Legal-text translations (adatvédelem, ÁSZF) need
owner review before `/en/` publish.

## Sources

- Astro i18n routing: https://docs.astro.build/en/guides/internationalization/
- Server islands (isolated context, prop serialization):
  https://docs.astro.build/en/guides/server-islands/
- Route caching (route rules, no globs):
  https://docs.astro.build/en/guides/caching/
- Sitemap i18n alternates:
  https://docs.astro.build/en/guides/integrations-guide/sitemap/
- Pagefind multilingual (lang-attribute-driven index split):
  https://pagefind.app/docs/multilingual/
- Vendure localization, LanguageCode, Accept-Language resolution:
  https://docs.vendure.io/current/framework/user-guide/localization
- Tina internationalization (directory-based):
  https://tina.io/docs/guides/internationalization
- Google hreflang requirements:
  https://developers.google.com/search/docs/advanced/crawling/localized-versions
- i18next TypeScript (CustomTypeOptions, interpolation checks):
  https://www.i18next.com/overview/typescript
- i18next supported frameworks (Astro integrations, official CLI):
  https://www.i18next.com/overview/supported-frameworks
