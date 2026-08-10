import { z } from "zod";
import type { IProduct } from "./types.svelte";
import { PRODUCT_FIELD_TYPE_VALUES } from "./productFieldTypes";

const STORAGE_KEY = "babasarok-order-state";
// Bump when the persisted value shapes change (older state is then discarded).
const STORAGE_VERSION = 2;

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
    return parsed.success ? parsed.data.state : null;
  } catch {
    return null;
  }
}

export function saveOrderState(state: OrderFormState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  // Persist only the user-entered values; zod strips transient `error`s.
  const parsed = savedStateSchema.safeParse({
    ...state,
    products: state.products.map((product) => ({
      product_id: product.product_id,
      count: product.count,
      fields: product.fields.map((field) => ({
        name: field.name,
        type: field.type,
        value: field.value,
      })),
      materials: product.materials.values,
    })),
  });

  if (!parsed.success) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state: parsed.data }));
  } catch {
    // Ignore write failures (e.g. quota exceeded / privacy mode).
  }
}
