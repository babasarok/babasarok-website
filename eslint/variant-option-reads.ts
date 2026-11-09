const message =
  "Reads a generated variant's options. ADR 0016: the line's selections plus the product definition are the only source of a configured line's choices — derive them with `axisCodes` from @babasarok/pricing instead. Variants are going away (one per product); see docs/adr/0016-one-variant-per-configurable-product.md.";

const variantNames = "/^(productVariant|variant)$/";

export const variantOptionReadSelectors = [
  `MemberExpression[property.name='options'][object.name=${variantNames}]`,
  `MemberExpression[property.name='options'][object.property.name=${variantNames}]`,
  "Property[key.name='productVariant'] > ObjectExpression > Property[key.name='options']",
  String.raw`Property[key.name='relations'] Literal[value=/^(productVariant\.)?options(\.group)?$/]`,
].map((selector) => ({ selector, message }));

/** The remaining uses of the variant matrix (ADR 0016); entries only ever leave. */
export const variantOptionReadAllowlist = [
  "backend/src/plugins/pricing/variant-agreement.ts",
  "backend/src/plugins/product/product-definition.service.ts",
  "backend/src/plugins/product/product.resolver.ts",
  "backend/src/plugins/product/sync-state.ts",
  "backend/src/plugins/product/variant-plan.test.ts",
  "src/lib/basket/lineInput.ts",
];

export const variantOptionReadFiles = ["backend/src/**/*.ts", "src/**/*.ts", "src/**/*.svelte"];
