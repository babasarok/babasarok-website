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
} from "./model.ts";
export {
  DEFAULT_TEXT_LANGUAGE,
  LocalizedTextSchema,
  resolveText,
  type LocalizedText,
} from "./localized-text.ts";
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
} from "./material.ts";
export {
  FieldVisibilitySchema,
  PatternSchema,
  fieldBaseShape,
  type FieldVisibility,
} from "./field.ts";
export {
  ChoiceFieldSchema,
  ChoiceOptionIdSchema,
  ChoiceOptionSchema,
  type ChoiceField,
  type ChoiceOption,
  type ChoiceOptionId,
} from "./field-kinds/choice.ts";
export { InputFieldSchema, type InputField } from "./field-kinds/input.ts";
export { ToggleFieldSchema, type ToggleField } from "./field-kinds/toggle.ts";
export { MaterialFieldSchema, type MaterialField } from "./field-kinds/material.ts";
export { EmbroideryFieldSchema, type EmbroideryField } from "./field-kinds/embroidery.ts";
export {
  ForbiddenMaterialCombinationSchema,
  ProductDefinitionSchema,
  ProductFieldSchema,
  ProductPricingSchema,
  type ProductDefinition,
  type ProductDefinitionInput,
  type ProductField,
  type ProductPricing,
} from "./product.ts";
export { byCodeUnit, canonicalJson } from "./canonical-json.ts";
export {
  parseLineSelections,
  serializeLineSelections,
  LineSelectionsError,
  LineSelectionRecordSchema,
  LineSelectionsSchema,
  type LineSelectionRecord,
  type LineSelections,
} from "./line-selection.ts";
export { dependencyOrder, isVisible } from "./field-visibility.ts";
export {
  selectionDetails,
  type EmailDetail,
  type SelectionDetail,
  type SelectionDetailsInput,
  type SelectionLabels,
} from "./selection-details.ts";
export {
  DiscountedProductSetSchema,
  ProductGroupDefinitionSchema,
  ProductGroupIdSchema,
  RelatedItemsSchema,
  type DiscountedProductSet,
  type ProductGroupDefinition,
  type ProductGroupId,
  type RelatedItems,
} from "./product-group.ts";
export { ProductCatalogSchema, type ProductCatalog } from "./catalog.ts";
