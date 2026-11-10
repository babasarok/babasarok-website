/**
 * Catalog rendering guard (ADR 0017): HTML pages never wait for the shop API.
 * Pages are prerendered shells and islands read the catalog through the
 * browser-side catalog store; only the detail routes render on demand, and
 * only crawlers make them wait (for their meta).
 */

const ADR = "See docs/adr/0017-static-catalog-shells.md.";

export const catalogFetchFiles = ["src/**/*.astro", "src/**/*.svelte"];

export const catalogFetchImports = {
  name: "@/lib/catalog",
  importNames: ["getCatalog", "getProducts", "getProduct", "getMaterials", "getMaterial"],
  message: `Pages and components never call the shop API while rendering: in a prerendered page the build would depend on the backend, in an on-demand one visitors would wait for it. Islands read the catalog through \`catalogStore\` (@/lib/catalog/store, via \`remoteValue\`); detail routes get crawler meta from \`crawlerMeta\`. ${ADR}`,
};

export const onDemandPageFiles = ["src/pages/**/*.astro"];

/** The detail routes render on demand so crawlers get the item's own title and image. */
export const onDemandPageAllowlist = [
  String.raw`src/pages/product/\[id\].astro`,
  String.raw`src/pages/en/product/\[id\].astro`,
  String.raw`src/pages/material/\[slug\].astro`,
  String.raw`src/pages/en/material/\[slug\].astro`,
];

export const onDemandPageSelectors = [
  {
    selector:
      "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='prerender'][init.value=false]",
    message: `HTML pages are prerendered shells: catalog data loads in the browser through \`catalogStore\`, so a page never needs to render on demand. Only the product and material detail routes do, for crawler meta. ${ADR}`,
  },
];
