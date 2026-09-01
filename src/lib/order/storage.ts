import { z } from "zod";
import type { Field, IProduct, ProductMaterialValue } from "../types.svelte";
import { PRODUCT_FIELD_TYPE_VALUES } from "../product/fieldTypes";

const STORAGE_KEY = "babasarok-order-state";
// Bump when the persisted value shapes change (older state is then discarded).
// Note: dedup is applied on load (see `loadOrderState`), so it does NOT change
// the persisted shape and does not require a version bump.
const STORAGE_VERSION = 3;

/** localStorage key the order/basket state is persisted under. */
export const ORDER_STORAGE_KEY = STORAGE_KEY;

const stringValuedTypes = PRODUCT_FIELD_TYPE_VALUES.filter(
  (type) => type !== "toggle" && type !== "embroidery"
) as [string, ...string[]];

const stringValue = z.object({ value: z.string(), is_custom: z.boolean().optional() });

const embroideryValue = z.object({
  enabled: z.boolean(),
  text: z.object({ value: z.string() }),
  color: z.object({ color: z.string(), custom_color: z.string().optional() }),
});

// Only the user-entered field value, validated against its type. Unknown keys
// (including transient `error`s) are stripped so restore stays clean.
const savedField = z.discriminatedUnion("type", [
  z.object({ name: z.string(), type: z.enum(stringValuedTypes), value: stringValue.optional() }),
  z.object({
    name: z.string(),
    type: z.literal("toggle"),
    value: z.object({ value: z.boolean() }).optional(),
  }),
  z.object({ name: z.string(), type: z.literal("embroidery"), value: embroideryValue.optional() }),
]);

const savedMaterial = z.object({
  material_id: z.string(),
  colors: z.array(z.string()),
  custom_color: z.string().optional(),
});

const savedProductSchema = z.object({
  uuid: z.string(),
  product_id: z.string(),
  count: z.number(),
  fields: z.array(savedField),
  materials: z.array(savedMaterial),
});

const savedStateSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  deliveryMethod: z.string(),
  address: z.string(),
  message: z.string(),
  products: z.array(savedProductSchema),
});

const envelopeSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  state: savedStateSchema,
});

export type SavedProduct = z.infer<typeof savedProductSchema>;
export type SavedOrderState = z.infer<typeof savedStateSchema>;

/** The live order form state handed to {@link saveOrderState}. */
export interface OrderFormState extends Omit<SavedOrderState, "products"> {
  products: IProduct[];
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Accessing localStorage can throw (e.g. disabled cookies / privacy mode).
    return null;
  }
}

export function loadOrderState(): SavedOrderState | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(raw));
    // `mergeDuplicateBasketItems` is a no-op on already-merged state, so it is
    // safe to run on every load (it also heals state that accumulated identical
    // lines before dedup existed).
    return parsed.success
      ? { ...parsed.data.state, products: mergeDuplicateBasketItems(parsed.data.state.products) }
      : null;
  } catch {
    return null;
  }
}

/**
 * The user-entered value of one field, dropped of its transient `error` (the
 * only live-only key). Built explicitly per field type instead of cast, so the
 * live→persisted mapping is checked by the type system.
 */
function toSavedField(field: Field): SavedProduct["fields"][number] {
  const { name, type } = field;
  switch (type) {
    case "toggle": {
      return field.value ? { name, type, value: { value: field.value.value } } : { name, type };
    }
    case "embroidery": {
      return field.value
        ? {
            name,
            type,
            value: {
              enabled: field.value.enabled,
              text: { value: field.value.text.value },
              color: {
                color: field.value.color.color,
                ...(field.value.color.custom_color == null
                  ? {}
                  : { custom_color: field.value.color.custom_color }),
              },
            },
          }
        : { name, type };
    }
    default: {
      return field.value
        ? {
            name,
            type,
            value: {
              value: field.value.value,
              ...(field.value.is_custom == null ? {} : { is_custom: field.value.is_custom }),
            },
          }
        : { name, type };
    }
  }
}

/** The user-entered value of one material slot, dropped of its transient `error`. */
function toSavedMaterial(value: ProductMaterialValue): SavedProduct["materials"][number] {
  return {
    material_id: value.material_id,
    colors: value.colors,
    ...(value.custom_color == null ? {} : { custom_color: value.custom_color }),
  };
}

/**
 * Map a live order item down to the persisted, user-entered-values-only shape.
 * Undefined material slots are dropped: they can only appear on an unsaved,
 * never-validated item (a validated save has every slot filled by
 * `validateItem`), and a `SavedProduct` never carries them.
 */
export function mapProductToSaved(product: IProduct): SavedProduct {
  return {
    uuid: product.uuid,
    product_id: product.product_id,
    count: product.count,
    fields: product.fields.map(toSavedField),
    materials: product.materials.values
      .filter((value): value is ProductMaterialValue => value != null)
      .map(toSavedMaterial),
  };
}

function writeEnvelope(state: SavedOrderState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state }));
  } catch {
    // Ignore write failures (e.g. quota exceeded / privacy mode).
  }
}

const EMPTY_STATE: SavedOrderState = {
  name: "",
  email: "",
  phone: "",
  deliveryMethod: "",
  address: "",
  message: "",
  products: [],
};

/** Normalised view of a persisted item's material selections (order- and
 * error-field-independent), for the duplicate-line comparison below. */
function normalizeSavedMaterials(item: SavedProduct): string {
  return JSON.stringify(
    item.materials
      .filter((m) => m.material_id !== "")
      .map((m) => ({
        material_id: m.material_id,
        colors: m.colors.toSorted(),
        custom_color: m.custom_color ?? "",
      }))
      .toSorted((a, b) => a.material_id.localeCompare(b.material_id))
  );
}

/** Normalised view of a persisted item's field values (order- and
 * error-field-independent). */
function normalizeSavedFields(item: SavedProduct): string {
  return JSON.stringify(
    item.fields
      .map((f) => ({ name: f.name, type: f.type, value: f.value ?? null }))
      .toSorted((a, b) => a.name.localeCompare(b.name))
  );
}

/**
 * Whether two persisted basket lines are the *same* item: same product, same
 * material selections and same field values. Count is deliberately excluded —
 * that is exactly what merging sums. Lines that differ in any user-entered
 * value (e.g. embroidery text) stay separate.
 */
export function isSameBasketItem(a: SavedProduct, b: SavedProduct): boolean {
  return (
    a.product_id === b.product_id &&
    normalizeSavedMaterials(a) === normalizeSavedMaterials(b) &&
    normalizeSavedFields(a) === normalizeSavedFields(b)
  );
}

/**
 * Merge identical basket lines into one, summing their counts. The first
 * occurrence keeps its uuid and position (so deep-linked `?uuid=` items survive
 * the merge); later duplicates are absorbed into it.
 */
export function mergeDuplicateBasketItems(products: SavedProduct[]): SavedProduct[] {
  const merged: SavedProduct[] = [];
  for (const item of products) {
    const existing = merged.find((p) => isSameBasketItem(p, item));
    if (existing) {
      existing.count += item.count;
    } else {
      merged.push({ ...item, materials: [...item.materials], fields: [...item.fields] });
    }
  }
  return merged;
}

/** The persisted basket items, or an empty array when nothing is stored. */
export function loadBasketProducts(): SavedProduct[] {
  return loadOrderState()?.products ?? [];
}

/**
 * Apply `mutator` to just the basket products while preserving the rest of the
 * order state (name, email, delivery, …). Returns the persisted state.
 */
export function updateBasketProducts(
  mutator: (products: SavedProduct[]) => SavedProduct[]
): SavedOrderState {
  const current = loadOrderState() ?? EMPTY_STATE;
  const parsed = savedStateSchema.safeParse({
    ...current,
    products: mutator(current.products),
  });
  if (!parsed.success) {
    return current;
  }
  writeEnvelope(parsed.data);
  return parsed.data;
}

/**
 * Update the contact/delivery envelope fields (name, email, delivery, …) while
 * preserving the persisted basket products. Lets the checkout page save contact
 * details without touching the basket the {@link updateBasketProducts} flow owns.
 */
export function updateOrderEnvelope(fields: Omit<SavedOrderState, "products">): SavedOrderState {
  const current = loadOrderState() ?? EMPTY_STATE;
  const parsed = savedStateSchema.safeParse({ ...fields, products: current.products });
  if (!parsed.success) {
    return current;
  }
  writeEnvelope(parsed.data);
  return parsed.data;
}

export function saveOrderState(state: OrderFormState): void {
  // Persist only the user-entered values; zod strips transient `error`s.
  const parsed = savedStateSchema.safeParse({
    ...state,
    products: state.products.map((product) => mapProductToSaved(product)),
  });

  if (!parsed.success) {
    return;
  }

  writeEnvelope(parsed.data);
}
