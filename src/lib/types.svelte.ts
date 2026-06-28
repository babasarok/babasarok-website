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
