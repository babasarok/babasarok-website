const message =
  "Reads a generated variant's options. ADR 0016: a configurable product has one variant and its line's selections plus the product definition are the only source of its choices — derive them with `axisCodes` from @babasarok/pricing instead. See docs/adr/0016-one-variant-per-configurable-product.md.";

const variantNames = "/^(productVariant|variant)$/";

export const variantOptionReadSelectors = [
  `MemberExpression[property.name='options'][object.name=${variantNames}]`,
  `MemberExpression[property.name='options'][object.property.name=${variantNames}]`,
  "Property[key.name='productVariant'] > ObjectExpression > Property[key.name='options']",
  String.raw`Property[key.name='relations'] Literal[value=/^(productVariant\.)?options(\.group)?$/]`,
].map((selector) => ({ selector, message }));

export const variantOptionReadFiles = ["backend/src/**/*.ts", "src/**/*.ts", "src/**/*.svelte"];
