import { v4 } from "uuid";
import type { ProductMaterialValue } from "./types.svelte";
import type { CmsProduct } from "./data";

export interface ValueWithError {
  value: string;
  is_custom?: boolean;
  error?: string | undefined;
}

type CmsField = NonNullable<CmsProduct["fields"]>[number];
type CmsProductMaterial = NonNullable<CmsProduct["materials"]>;

export type Field = CmsField & { value?: ValueWithError | undefined };
export type ProductMaterials = CmsProductMaterial & {
  values: Array<ProductMaterialValue | undefined>;
};

export interface IProduct extends Required<Omit<CmsProduct, "materials">> {
  uuid: string;
  count: number;
  materials: ProductMaterials;
  fields: Field[];
}
