// Re-exports are spelled out per module: the dashboard's vite pipeline
// resolves workspace-linked packages from source, where a CJS `export *`
// indirection has no statically detectable named exports.
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
  ThreadColorDefinitionSchema,
  ThreadColorIdSchema,
  ThreadColorPaletteSchema,
  type ThreadColorDefinition,
  type ThreadColorId,
  type ThreadColorPalette,
} from "./thread-color.js";
export {
  ForbiddenMaterialCombinationSchema,
  PRODUCT_TYPE_VALUES,
  ProductDefinitionSchema,
  ProductDiscountSchema,
  ProductFieldSchema,
  ProductPricingSchema,
  ProductTypeSchema,
  canonicalJson,
  productRevision,
  type ProductDefinition,
  type ProductDefinitionInput,
  type ProductDiscount,
  type ProductField,
  type ProductPricing,
  type ProductType,
} from "./product.js";
