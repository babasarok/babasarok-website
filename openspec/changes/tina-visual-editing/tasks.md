# Tasks: TinaCMS visual editing on Cloudflare

Phase 1 is the recommended start; Phase 2 only if editors need instant
preview.

## 1. Phase 1 — static contextual click-to-edit

- [ ] 1.1 Add `data-tina-field={tinaField(data, '…')}` attributes to the
      section components (`Hero`, `Service`, `About`, `Product`, `Blog`,
      `Header`/`Footer`)
- [ ] 1.2 Extend `requestWithMetadata()` to the loaders backing those sections
      and make `resolveTinaImageRefs()` metadata-preserving for editable
      entities (or resolve their images a different way); verify the
      `no-tina-cloud-urls` guard still passes
- [ ] 1.3 Verify in the Tina admin: clicking a region focuses the right field,
      and Save commits to Git and rebuilds

## 2. Phase 2 — live island refetch (only if needed)

- [ ] 2.1 Add `@astrojs/cloudflare` and set it as the adapter in
      `astro.config.ts` (keep `output: 'static'`)
- [ ] 2.2 Create the island registry (`src/lib/islands.ts`) and the
      `prerender = false` `src/pages/tina-island/[name].ts` route
- [ ] 2.3 Wrap each editable section so the bridge can swap its markup
- [ ] 2.4 Deploy to Cloudflare Pages/Workers and smoke-test `/admin` and
      `/tina-island/*` under `wrangler dev`; budget ~$5/mo Workers Paid
