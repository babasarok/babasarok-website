// Re-exports are spelled out per module because the dashboard's vite pipeline
// resolves the package's built CJS dist (vite.config.mts commonjsOptions), and
// a barrel that transitively required node:crypto (productRevision) externalized
// it into the browser bundle — that export now lives behind the node-only
// subpath (`@babasarok/product-definition/node`).
export {
  CatalogRevisionSchema,
  LabelSchema,
  MoneySchema,
  PositiveMoneySchema,
  ProductFieldIdSchema,
  ProductIdSchema,
  ProductRevisionSchema,
  TrimmedTextSchema,
  type CatalogRevision,
  type Money,
  type PositiveMoney,
  type ProductFieldId,
  type ProductId,
  type ProductRevision,
} from "./model.js";
export {
  DEFAULT_TEXT_LANGUAGE,
  LocalizedTextSchema,
  resolveText,
  type LocalizedText,
} from "./localized-text.js";
export {
  ColorAppearanceSchema,
  MaterialColorDefinitionSchema,
  MaterialColorIdSchema,
  MaterialDefinitionSchema,
  MaterialIdSchema,
  type ColorAppearance,
  type MaterialColorDefinition,
  type MaterialColorId,
  type MaterialDefinition,
  type MaterialId,
} from "./material.js";
export {
  FieldVisibilitySchema,
  PatternSchema,
  fieldBaseShape,
  type FieldVisibility,
} from "./field.js";
export {
  ChoiceFieldSchema,
  ChoiceOptionIdSchema,
  ChoiceOptionSchema,
  type ChoiceField,
  type ChoiceOption,
  type ChoiceOptionId,
} from "./field-kinds/choice.js";
export { InputFieldSchema, type InputField } from "./field-kinds/input.js";
export { ToggleFieldSchema, type ToggleField } from "./field-kinds/toggle.js";
export { MaterialFieldSchema, type MaterialField } from "./field-kinds/material.js";
export { EmbroideryFieldSchema, type EmbroideryField } from "./field-kinds/embroidery.js";
export {
  ForbiddenMaterialCombinationSchema,
  ProductDefinitionSchema,
  ProductFieldSchema,
  ProductPricingSchema,
  type ProductDefinition,
  type ProductDefinitionInput,
  type ProductField,
  type ProductPricing,
} from "./product.js";
export { byCodeUnit, canonicalJson } from "./canonical-json.js";
export {
  DiscountedProductSetSchema,
  ProductGroupDefinitionSchema,
  ProductGroupIdSchema,
  RelatedItemsSchema,
  type DiscountedProductSet,
  type ProductGroupDefinition,
  type ProductGroupId,
  type RelatedItems,
} from "./product-group.js";
export { ProductCatalogSchema, type ProductCatalog } from "./catalog.js";
