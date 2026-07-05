import type { CmsEnhancedProduct } from "./data";
export interface ValueWithError {
  value: string;
  is_custom?: boolean;
  error?: string | undefined;
}

export interface ProductMaterialValue {
  material_id: string;
  colors: string[];
  custom_color?: string | undefined;
  error?: string | undefined;
}

export type CmsField = NonNullable<CmsEnhancedProduct["fields"]>[number];
export type CmsProductMaterials = NonNullable<CmsEnhancedProduct["materials"]>;
export type CmsProductMaterial = NonNullable<CmsProductMaterials["materials"]>[number];

export type Field = CmsField & { value?: ValueWithError | undefined };
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
