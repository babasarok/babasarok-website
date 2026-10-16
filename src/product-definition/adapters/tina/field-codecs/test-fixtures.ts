import type {
  TinaProductFieldItemSource,
  TinaProductFieldMaterialOptionSource,
  TinaProductFieldSource,
} from "../source-types";

type FieldIdentity = Pick<TinaProductFieldSource, "name" | "label" | "type">;

export function createFieldSource(
  identity: FieldIdentity
): (overrides?: Partial<TinaProductFieldSource>) => TinaProductFieldSource {
  return (overrides = {}) => ({
    __typename: "ProductFields",
    price: null,
    optional: null,
    price_unit: null,
    tooltip: null,
    color_count: null,
    allow_custom_value: null,
    regex: null,
    placeholder: null,
    items: null,
    materials: null,
    depends_on: null,
    ...identity,
    ...overrides,
  });
}

export function fieldItem(
  value: string,
  overrides: Partial<TinaProductFieldItemSource> = {}
): TinaProductFieldItemSource {
  return {
    __typename: "ProductFieldsItems",
    value,
    label: null,
    price: null,
    tooltip: null,
    ...overrides,
  };
}

export function materialOption(
  materialId: string,
  price: number
): TinaProductFieldMaterialOptionSource {
  return {
    __typename: "ProductFieldsMaterials",
    price,
    material_path: { material_id: materialId },
  };
}
