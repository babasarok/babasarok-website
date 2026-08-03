/**
 * Test fixtures for the order-form domain logic.
 *
 * The order pipeline (pricing → validation → order-string formatting) only ever
 * reads a small, well-defined slice of the generated Tina `CmsProduct` shape.
 * Rather than hand-author full Tina documents (with `_sys`, `id`, `__typename`,
 * …) these builders construct just that runtime slice and cast it to the lib
 * types, so tests stay readable and focused on the fields that actually drive
 * behaviour.
 */
import type {
  CmsProductMaterial,
  Field,
  EmbroideryValue,
  IProduct,
  ProductMaterialValue,
  ToggleValue,
  ValueWithError,
} from "@/lib/types.svelte";
import type { CmsEnhancedDeliveryMethod } from "@/lib/data";

type FieldType = "input" | "select" | "radio" | "color" | "toggle" | "embroidery";

interface FieldItem {
  value: string;
  label?: string;
  price?: number | null;
  tooltip?: string;
}

export interface FieldOpts {
  name: string;
  type: FieldType;
  label?: string;
  price?: number | null;
  price_unit?: "flat" | "word" | null;
  optional?: boolean;
  items?: FieldItem[];
  allow_custom_value?: boolean;
  regex?: string;
  value?: ValueWithError | ToggleValue | EmbroideryValue;
  depends_on?: { field?: string | null; value?: string | null } | null;
}

/** Build a single product `Field` (the runtime slice the order logic reads). */
export function makeField(opts: FieldOpts): Field {
  const { value, items, ...rest } = opts;
  return {
    label: opts.label ?? opts.name,
    ...rest,
    ...(items ? { items: items.map((i) => ({ label: i.value, ...i })) } : {}),
    ...(value ? { value } : {}),
  } as unknown as Field;
}

export function fieldError(field: Field | undefined): string | undefined {
  if (!field || field.type === "embroidery") {
    return undefined;
  }
  return field.value?.error;
}

interface MaterialColor {
  color_id: string;
  label?: string;
  hex?: string;
}

export interface MaterialOpts {
  material_id: string;
  label?: string;
  price?: number | null;
  /** Number of selectable colors, or the field `name` that supplies it. */
  color_count?: string;
  colors?: MaterialColor[];
}

/** Build a product-material definition (`product.materials.materials[n]`). */
export function makeMaterial(opts: MaterialOpts): CmsProductMaterial {
  return {
    __typename: "ProductMaterialsMaterials",
    price: opts.price ?? null,
    color_count: opts.color_count ?? null,
    material_path: {
      material_id: opts.material_id,
      label: opts.label ?? opts.material_id,
      colors: (opts.colors ?? []).map((c) => ({ label: c.color_id, hex: undefined, ...c })),
    },
  } as unknown as CmsProductMaterial;
}

export interface ProductOpts {
  title?: string;
  count?: number;
  price?: number | null;
  discount?: number | null;
  discount_valid_until?: string | null;
  length_based_pricing?: {
    sourceField: string;
  };
  fields?: Field[];
  materials?: CmsProductMaterial[];
  material_required_count?: number;
  values?: Array<ProductMaterialValue | undefined>;
  banned_combinations?: { materials: { material_path: { material_id: string } }[] }[];
}

/** Build an `IProduct` order item with sensible defaults. */
export function makeProduct(opts: ProductOpts = {}): IProduct {
  return {
    __typename: "Product",
    uuid: "test-uuid",
    title: opts.title ?? "Termék",
    count: opts.count ?? 1,
    price: opts.price ?? null,
    discount: opts.discount ?? null,
    discount_valid_until: opts.discount_valid_until ?? null,
    length_based_pricing: opts.length_based_pricing ?? undefined,
    fields: opts.fields ?? [],
    materials: {
      __typename: "ProductMaterials",
      materials: opts.materials ?? [],
      material_required_count: opts.material_required_count ?? (opts.materials ? 1 : 0),
      values: opts.values ?? [],
      banned_combinations: opts.banned_combinations ?? [],
    },
  } as unknown as IProduct;
}

/** Build a delivery method. */
export function makeDelivery(
  name = "Személyes átvétel",
  price = 0,
  delivery_name = "szemelyes"
): CmsEnhancedDeliveryMethod {
  return {
    delivery_name,
    name,
    price,
  };
}
