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
  CmsProductMaterialOption,
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
  /** Number of selectable colors, or the field `name` that supplies it.
   * In the new shape this is carried on the material option (slot), so
   * {@link makeProduct} lifts it onto the generated option. */
  color_count?: string;
  colors?: MaterialColor[];
}

/** Build a single material choice (`material_options[n].materials[n]`). The
 * `color_count` is kept on the object so {@link makeProduct} can lift it onto
 * the enclosing option. */
export function makeMaterial(opts: MaterialOpts): CmsProductMaterial {
  return {
    __typename: "ProductMaterialsMaterial_optionsMaterials",
    price: opts.price ?? null,
    color_count: opts.color_count ?? null,
    material_path: {
      material_id: opts.material_id,
      label: opts.label ?? opts.material_id,
      colors: (opts.colors ?? []).map((c) => ({ label: c.color_id, hex: undefined, ...c })),
    },
  } as unknown as CmsProductMaterial;
}

export interface MaterialOptionOpts {
  label?: string;
  /** Number of selectable colors, or the field `name` that supplies it. */
  color_count?: string;
  materials?: CmsProductMaterial[];
}

/** Build a material option (slot): a label, its colour count, and the material
 * choices available for that slot. */
export function makeMaterialOption(opts: MaterialOptionOpts = {}): CmsProductMaterialOption {
  return {
    __typename: "ProductMaterialsMaterial_options",
    label: opts.label ?? "Anyag",
    color_count: opts.color_count ?? null,
    materials: opts.materials ?? [],
  } as unknown as CmsProductMaterialOption;
}

export interface ProductOpts {
  title?: string;
  uuid?: string;
  product_id?: string;
  count?: number;
  price?: number;
  discount?: number | null;
  discount_valid_until?: string | null;
  length_based_pricing?: {
    sourceField: string;
  };
  fields?: Field[];
  /** Legacy flat material pool: {@link makeProduct} fans it out into
   * `material_required_count` identical options. */
  materials?: CmsProductMaterial[];
  material_required_count?: number;
  /** Explicit per-slot options; takes precedence over `materials`. */
  material_options?: CmsProductMaterialOption[];
  values?: Array<ProductMaterialValue | undefined>;
  banned_combinations?: { materials: { material_path: { material_id: string } }[] }[];
}

/** Fan a legacy flat pool + required count out into explicit per-slot options,
 * lifting the pool's colour count onto each option. */
function buildMaterialOptions(opts: ProductOpts): CmsProductMaterialOption[] {
  if (opts.material_options) {
    return opts.material_options;
  }
  const pool = opts.materials ?? [];
  const count = opts.material_required_count ?? (pool.length > 0 ? 1 : 0);
  const color_count =
    pool
      .map((m) => (m as unknown as { color_count?: string | null }).color_count)
      .find((cc) => cc != null) ?? undefined;

  const options: CmsProductMaterialOption[] = [];
  for (let i = 0; i < count; i++) {
    options.push(
      makeMaterialOption({
        label: count === 1 ? "Anyag" : `Anyag ${i + 1}`,
        materials: pool,
        ...(color_count == null ? {} : { color_count }),
      })
    );
  }
  return options;
}

/** Build an `IProduct` order item with sensible defaults. */
export function makeProduct(opts: ProductOpts = {}): IProduct {
  return {
    __typename: "Product",
    uuid: opts.uuid ?? "test-uuid",
    product_id: opts.product_id ?? "test-product",
    title: opts.title ?? "Termék",
    count: opts.count ?? 1,
    price: opts.price ?? 0,
    discount: opts.discount ?? null,
    discount_valid_until: opts.discount_valid_until ?? null,
    length_based_pricing: opts.length_based_pricing ?? undefined,
    fields: opts.fields ?? [],
    materials: {
      __typename: "ProductMaterials",
      material_options: buildMaterialOptions(opts),
      values: opts.values ?? [],
      banned_combinations: opts.banned_combinations ?? [],
    },
  } as unknown as IProduct;
}

/** Build a delivery method. */
export function makeDelivery(
  name = "Személyes átvétel",
  price = 0,
  delivery_name = "szemelyes",
  needs_address?: boolean,
  free_above?: number
): CmsEnhancedDeliveryMethod {
  return {
    delivery_name,
    name,
    price,
    needs_address,
    free_above: free_above ?? null,
  };
}
