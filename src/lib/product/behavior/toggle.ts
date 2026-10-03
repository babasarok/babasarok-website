import { defineBehavior } from "./index";

/**
 * Behaviour of the `toggle` field type: a boolean switch whose value is always
 * either on or off — there is no blank state.
 *
 * The off state is *hidden* from the basket summary (only an on toggle shows
 * "Igen") but still *recorded* by the order email as "Nem", and it contributes
 * an explicit `price: 0` part so the price breakdown always lists the field.
 */
export const toggleBehavior = defineBehavior("toggle", {
  normalize: (f, _ctx) => {
    f.value ??= { value: false };
  },
  resolveValue: (f) => f.value?.value,
  price: (f) =>
    f.value?.value === undefined
      ? undefined
      : { label: f.label || f.name, price: f.value.value ? (f.price ?? undefined) : 0 },
  enumerate: (f) => [
    { ...f, value: { value: false } },
    { ...f, value: { value: true } },
  ],
  fillFromParams: (f, raw) => {
    f.value = { value: raw === "true" || raw === "1" };
  },
  toSaved: (f) => (f.value ? { value: f.value.value } : undefined),
  validate: (f, _ctx) => {
    // A toggle always holds a boolean, so there is nothing to require.
    f.value ??= { value: false };
    f.value.error = undefined;
  },
  hasError: (f) => (f.value ? !!f.value.error : false),
  clearErrors: (f) => {
    if (f.value) {
      f.value.error = undefined;
    }
  },
  formatValue: (f, _ctx) => (f.value?.value ? "Igen" : undefined),
  includeInEmail: (f) => !f.optional || !!f.value?.value,
  formatForEmail: (f, _ctx) => (f.value?.value ? "Igen" : "Nem"),
});
