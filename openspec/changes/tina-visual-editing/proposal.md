# Change: TinaCMS visual editing on Cloudflare

## Why

Editors currently change content through the Tina admin form and only see the
result after a save + rebuild. The official `tina-astro-starter` supports
in-context visual editing, which we want; adopting it is a deliberate
infrastructure decision (the live-preview level needs an on-demand SSR route,
hence an adapter and a Cloudflare deployment), so it is scoped here before any
code changes.

## What Changes

- **Phase 1 (recommended start):** static contextual click-to-edit — add
  `data-tina-field` attributes to the section components, extend
  `requestWithMetadata()` to the loaders backing them, and make image-ref
  resolution metadata-preserving for editable entities. No adapter, stays 100%
  static, $0 infrastructure.
- **Phase 2 (only if editors need instant keystroke preview):** adopt the
  starter's live island refetch — `@astrojs/cloudflare` adapter, an island
  registry, a `prerender = false` `/tina-island/[name]` route, and a Cloudflare
  deploy (~$5/mo Workers Paid budget as a safety margin).

## Capabilities

None — editor (Tina admin) infrastructure only; no shopper-facing behavior
changes. (Declares `skip_specs: true`.)

## Impact

- `astro.config.ts` (adapter; Phase 2 only)
- `src/lib/data.ts` (`requestWithMetadata()` coverage, metadata-preserving
  image-ref resolution)
- Section components in `src/components/blocks/` (`data-tina-field`
  attributes)
- New `src/lib/islands.ts` + `src/pages/tina-island/[name].ts` (Phase 2)
- Deployment: Cloudflare Pages/Workers (Phase 2); build-pipeline choice
  (Cloudflare Pages CI vs the existing GitHub Actions) and where the Tina
  Cloud credentials live for that build
