const message =
  "Reads a variant's options. A configurator product has one variant and its line's selections plus the product definition are the only source of its choices (ADR 0016) — derive them with `axisCodes` from @babasarok/pricing instead. Ready-made products carry owner-managed native options (ADR 0019): read them only through the modules in `variantOptionReadAllowlist` (eslint/variant-option-reads.ts). See docs/adr/0016-one-variant-per-configurable-product.md and docs/adr/0019-ready-made-product-options.md.";

const variantNames = "/^(productVariant|variant)$/";

export const variantOptionReadSelectors = [
  `MemberExpression[property.name='options'][object.name=${variantNames}]`,
  `MemberExpression[property.name='options'][object.property.name=${variantNames}]`,
  "Property[key.name=/^(relations|where|select)$/] Property[key.name='productVariant'] > ObjectExpression > Property[key.name='options']",
  String.raw`Property[key.name='relations'] Literal[value=/^(productVariant\.)?options(\.group)?$/]`,
].map((selector) => ({ selector, message }));

export const variantOptionReadFiles = ["backend/src/**/*.ts", "src/**/*.ts", "src/**/*.svelte"];

/** The only readers of ready-made products' native options (ADR 0019): the site's and the order emails'. */
export const variantOptionReadAllowlist = [
  "src/lib/catalog/variantOptions.ts",
  "backend/src/plugins/email/variant-option-details.ts",
];
