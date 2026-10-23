import type {
  TinaMaterialReferenceSource,
  TinaProductBannedCombinationMemberSource,
  TinaProductBannedCombinationSource,
  TinaProductFieldDependencySource,
  TinaProductFieldItemSource,
  TinaProductFieldMaterialOptionSource,
  TinaProductFieldSource,
  TinaProductGroupMemberSource,
  TinaProductGroupSource,
  TinaProductLengthPricingSource,
  TinaProductMaterialsSource,
  TinaProductReferenceSource,
  TinaProductSource,
} from "./source-types";

export type SourceFieldDisposition = "canonical" | "presentation" | "transport" | "ignored";

export const PRODUCT_SOURCE_FIELDS = {
  __typename: "transport",
  product_id: "canonical",
  title: "canonical",
  hidden_in_product_list: "presentation",
  can_be_ordered: "canonical",
  categories: "presentation",
  type: "canonical",
  date: "presentation",
  thumbnail: "presentation",
  shortDescription: "presentation",
  content: "presentation",
  icon: "presentation",
  price: "canonical",
  discount: "canonical",
  discount_valid_until: "canonical",
  images: "presentation",
  length_based_pricing: "canonical",
  materials: "canonical",
  fields: "canonical",
} satisfies Record<keyof TinaProductSource, SourceFieldDisposition>;

export const PRODUCT_FIELD_SOURCE_FIELDS = {
  __typename: "transport",
  name: "canonical",
  label: "canonical",
  type: "canonical",
  price: "canonical",
  optional: "canonical",
  price_unit: "canonical",
  tooltip: "canonical",
  color_count: "canonical",
  allow_custom_value: "canonical",
  regex: "canonical",
  placeholder: "canonical",
  items: "canonical",
  materials: "canonical",
  depends_on: "canonical",
} satisfies Record<keyof TinaProductFieldSource, SourceFieldDisposition>;

export const PRODUCT_FIELD_ITEM_SOURCE_FIELDS = {
  __typename: "transport",
  value: "canonical",
  label: "canonical",
  price: "canonical",
  tooltip: "canonical",
} satisfies Record<keyof TinaProductFieldItemSource, SourceFieldDisposition>;

export const PRODUCT_FIELD_MATERIAL_OPTION_SOURCE_FIELDS = {
  __typename: "transport",
  price: "canonical",
  material_path: "canonical",
} satisfies Record<keyof TinaProductFieldMaterialOptionSource, SourceFieldDisposition>;

export const PRODUCT_FIELD_DEPENDENCY_SOURCE_FIELDS = {
  __typename: "transport",
  field: "canonical",
  value: "canonical",
} satisfies Record<keyof TinaProductFieldDependencySource, SourceFieldDisposition>;

export const PRODUCT_LENGTH_PRICING_SOURCE_FIELDS = {
  __typename: "transport",
  sourceField: "canonical",
} satisfies Record<keyof TinaProductLengthPricingSource, SourceFieldDisposition>;

export const PRODUCT_MATERIALS_SOURCE_FIELDS = {
  __typename: "transport",
  banned_combinations: "canonical",
} satisfies Record<keyof TinaProductMaterialsSource, SourceFieldDisposition>;

export const PRODUCT_BANNED_COMBINATION_SOURCE_FIELDS = {
  __typename: "transport",
  materials: "canonical",
} satisfies Record<keyof TinaProductBannedCombinationSource, SourceFieldDisposition>;

export const PRODUCT_BANNED_COMBINATION_MEMBER_SOURCE_FIELDS = {
  __typename: "transport",
  material_path: "canonical",
} satisfies Record<keyof TinaProductBannedCombinationMemberSource, SourceFieldDisposition>;

export const MATERIAL_REFERENCE_SOURCE_FIELDS = {
  __typename: "transport",
  material_id: "canonical",
  label: "ignored",
  thumbnail: "ignored",
  categories: "ignored",
  shortDescription: "ignored",
  content: "ignored",
  id: "transport",
  colors: "ignored",
  _sys: "transport",
} satisfies Record<keyof TinaMaterialReferenceSource, SourceFieldDisposition>;

export const PRODUCT_GROUP_SOURCE_FIELDS = {
  __typename: "transport",
  title: "canonical",
  discount_amount: "canonical",
  body: "presentation",
  products: "canonical",
} satisfies Record<keyof TinaProductGroupSource, SourceFieldDisposition>;

export const PRODUCT_GROUP_MEMBER_SOURCE_FIELDS = {
  __typename: "transport",
  product: "canonical",
} satisfies Record<keyof TinaProductGroupMemberSource, SourceFieldDisposition>;

export const PRODUCT_REFERENCE_SOURCE_FIELDS = {
  __typename: "transport",
  product_id: "canonical",
  title: "ignored",
  hidden_in_product_list: "ignored",
  can_be_ordered: "ignored",
  categories: "ignored",
  type: "ignored",
  date: "ignored",
  thumbnail: "ignored",
  shortDescription: "ignored",
  content: "ignored",
  icon: "ignored",
  price: "ignored",
  discount: "ignored",
  discount_valid_until: "ignored",
  id: "transport",
  images: "ignored",
  length_based_pricing: "ignored",
  materials: "ignored",
  fields: "ignored",
  _sys: "transport",
} satisfies Record<keyof TinaProductReferenceSource, SourceFieldDisposition>;
