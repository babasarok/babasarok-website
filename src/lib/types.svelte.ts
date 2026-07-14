import type { CmsEnhancedProduct } from "./data";
import type { ProductFieldType } from "./productFieldTypes";
export interface ValueWithError {
  value: string;
  is_custom?: boolean;
  error?: string | undefined;
}

/** Toggle fields hold a boolean, unlike the string-valued field types. */
export interface ToggleValue {
  value: boolean;
  error?: string | undefined;
}

export interface ProductMaterialValue {
  material_id: string;
  colors: string[];
  custom_color?: string | undefined;
  error?: string | undefined;
}

export type CmsField = NonNullable<NonNullable<CmsEnhancedProduct["fields"]>[number]>;
export type CmsProductMaterials = NonNullable<CmsEnhancedProduct["materials"]>;
export type CmsProductMaterial = NonNullable<CmsProductMaterials["materials"]>[number];

/** The runtime value shape each field `type` carries. */
interface FieldValueByType {
  input: ValueWithError;
  select: ValueWithError;
  radio: ValueWithError;
  color: ValueWithError;
  toggle: ToggleValue;
}

type FieldOf<T extends ProductFieldType> = Omit<CmsField, "type"> & {
  type: T;
  value?: FieldValueByType[T] | undefined;
};

/**
 * Form-side discriminated union: the flat CMS field tagged by `type`, each
 * carrying its own value shape (e.g. `toggle` holds a boolean). Distributing
 * over the central {@link ProductFieldType} keeps this exhaustive.
 */
export type Field = { [T in ProductFieldType]: FieldOf<T> }[ProductFieldType];

/** Every field type except `toggle` (i.e. the string-valued ones). */
export type NonToggleField = Exclude<Field, { type: "toggle" }>;
export type ProductMaterials = Omit<
  CmsProductMaterials,
  "values" | "materials" | "material_required_count"
> & {
  values: Array<ProductMaterialValue | undefined>;
  material_required_count: number;
  materials: CmsProductMaterial[];
};

export interface IProduct extends Omit<CmsEnhancedProduct, "materials" | "fields"> {
  uuid: string;
  count: number;
  materials: ProductMaterials;
  fields: Field[];
}
