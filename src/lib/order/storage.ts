import { z } from "zod";
import type { Field, IProduct } from "../types.svelte";
import { PRODUCT_FIELD_TYPE_VALUES } from "../product/fieldTypes";
import { FIELD_BEHAVIORS } from "../product/behavior";

const STORAGE_KEY = "babasarok-order-state";
// Bump when the persisted value shapes change (older state is then discarded).
// Note: dedup is applied on load (see `loadOrderState`), so it does NOT change
// the persisted shape and does not require a version bump.
const STORAGE_VERSION = 4;

/** localStorage key the order/basket state is persisted under. */
export const ORDER_STORAGE_KEY = STORAGE_KEY;

const stringValuedTypes = PRODUCT_FIELD_TYPE_VALUES.filter(
  (type) => type !== "toggle" && type !== "embroidery" && type !== "material"
) as [string, ...string[]];

const stringValue = z.object({ value: z.string(), is_custom: z.boolean().optional() });

const embroideryValue = z.object({
  enabled: z.boolean(),
  text: z.object({ value: z.string() }),
  color: z.object({ color: z.string() }),
});

const materialValue = z.object({ material_id: z.string(), colors: z.array(z.string()) });

// Only the user-entered field value, validated against its type. Unknown keys
// (including transient `error`s) are stripped so restore stays clean.
const savedField = z.discriminatedUnion("type", [
  z.object({ name: z.string(), type: z.enum(stringValuedTypes), value: stringValue.optional() }),
  z.object({
    name: z.string(),
    type: z.literal("toggle"),
    value: z.object({ value: z.boolean() }).optional(),
  }),
  z.object({
    name: z.string(),
    type: z.literal("material"),
    value: materialValue.optional(),
  }),
  z.object({ name: z.string(), type: z.literal("embroidery"), value: embroideryValue.optional() }),
]);

const savedProductSchema = z.object({
  uuid: z.string(),
  product_id: z.string(),
  count: z.number(),
  fields: z.array(savedField),
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
 * only live-only key). The live→persisted mapping lives in the field's
 * behaviour (`toSaved`); the per-type value shape is its `SavedFieldValue`
 * mirror.
 */
function toSavedField(field: Field): SavedProduct["fields"][number] {
  const { name, type } = field;
  const value = FIELD_BEHAVIORS[type].toSaved(field);
  if (value === undefined) {
    return { name, type };
  }
  // The core `SavedFieldValue` mirror is kept structurally identical to the
  // `savedField` value shapes (ADR 0006; the ADR 0002 layering rule forbids
  // product/ from importing order/ to assert the type↔value correlation
  // itself, so it is asserted here, once, at the seam). The `savedField`
  // schema re-checks the correlation on every save and load, so any drift
  // fails closed there.
  return { name, type, value } as SavedProduct["fields"][number];
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
  return a.product_id === b.product_id && normalizeSavedFields(a) === normalizeSavedFields(b);
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
      merged.push({ ...item, fields: [...item.fields] });
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
