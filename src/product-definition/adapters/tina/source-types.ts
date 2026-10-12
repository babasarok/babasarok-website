import type {
  ProductPartsFragment,
  Product_GroupsPartsFragment,
} from "../../../../tina/__generated__/types";

export type TinaProductSource = ProductPartsFragment;

type GeneratedProductField = NonNullable<NonNullable<TinaProductSource["fields"]>[number]>;

type GeneratedFieldMaterialOption = NonNullable<
  NonNullable<GeneratedProductField["materials"]>[number]
>;

export type TinaMaterialReferenceSource = GeneratedFieldMaterialOption["material_path"];

export type TinaMaterialIdSource = Pick<TinaMaterialReferenceSource, "material_id">;

export type TinaProductFieldSource = Omit<GeneratedProductField, "materials"> & {
  materials: Array<TinaProductFieldMaterialOptionSource | null> | null;
};

export type TinaProductFieldMaterialOptionSource = Omit<
  GeneratedFieldMaterialOption,
  "material_path"
> & {
  material_path: TinaMaterialIdSource;
};

export type TinaProductFieldItemSource = NonNullable<
  NonNullable<GeneratedProductField["items"]>[number]
>;

export type TinaProductFieldDependencySource = NonNullable<GeneratedProductField["depends_on"]>;

export type TinaProductLengthPricingSource = NonNullable<TinaProductSource["length_based_pricing"]>;

export type TinaProductMaterialsSource = NonNullable<TinaProductSource["materials"]>;

export type TinaProductBannedCombinationSource = NonNullable<
  NonNullable<TinaProductMaterialsSource["banned_combinations"]>[number]
>;

export type TinaProductBannedCombinationMemberSource = NonNullable<
  NonNullable<TinaProductBannedCombinationSource["materials"]>[number]
>;

export type TinaProductGroupSource = Product_GroupsPartsFragment;

export type TinaProductGroupMemberSource = NonNullable<
  NonNullable<TinaProductGroupSource["products"]>[number]
>;

export type TinaProductReferenceSource = NonNullable<TinaProductGroupMemberSource>["product"];
