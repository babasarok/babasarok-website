import { defineBehavior } from "./index";

/**
 * The `input` field type: free text the buyer types, optionally suggested by an
 * `items` datalist, pattern-checked by `regex`, and optionally accepting a
 * value outside that list (`allow_custom_value`). It never blocks the form and
 * contributes its flat `price` unconditionally — the breakdown shows the line
 * whether or not the buyer has typed anything.
 */
export const inputBehavior = defineBehavior("input", {
  // String-valued fields are left untouched: they hold no value until the
  // buyer acts, and validation prefills on submit (`prefillField` has no
  // input case).
  normalize: (_f, _ctx) => {},

  // The string value, or `undefined` when absent/blank.
  resolveValue: (f) => {
    const value = f.value?.value;
    return value === "" ? undefined : value;
  },

  // Unconditional — an unpriced input still shows as a "??" breakdown line.
  price: (f) => {
    return { label: f.label || f.name, price: f.price ?? undefined };
  },

  // Never required, never price-relevant — one shape, no value.
  enumerate: (f) => {
    return [f];
  },

  fillFromParams: (f, raw) => {
    const matchesOption = f.items?.some((item) => item?.value === raw);
    const isCustom = !matchesOption && !!f.allow_custom_value;
    // An unknown value without `allow_custom_value` is still kept; validation
    // re-judges it on submit.
    f.value = isCustom ? { value: raw, is_custom: true } : { value: raw };
  },

  // The conditional spread keeps an absent `is_custom` absent in the persisted
  // shape (never an explicit `is_custom: undefined`).
  toSaved: (f) => {
    return f.value
      ? {
          value: f.value.value,
          ...(f.value.is_custom == null ? {} : { is_custom: f.value.is_custom }),
        }
      : undefined;
  },

  validate: (f, _ctx) => {
    // Prefill when submitting: an input only holds a value once the buyer acts.
    f.value ??= { value: "" };

    f.value.error = undefined;
    if (!f.value.value && !f.optional) {
      f.value.error = "Kötelező mező";
      return;
    }

    // Runs even for an empty optional value: the original `break` falls
    // through to this check instead of returning.
    if (f.regex) {
      const regex = new RegExp(f.regex);
      if (!regex.test(f.value.value)) {
        f.value.error = "Érvénytelen formátum";
        return;
      }
    }
  },

  // Single error slot — no sub-slots like embroidery's text/colour.
  hasError: (f) => {
    return f.value ? !!f.value.error : false;
  },

  clearErrors: (f) => {
    if (f.value) {
      f.value.error = undefined;
    }
  },

  formatValue: (f, _ctx) => {
    const value = f.value?.value;
    if (!value) {
      return;
    }
    if (f.value?.is_custom) {
      return `Egyedi: ${value}`;
    }
    const option = f.items?.find((o) => o?.value === value);
    return option?.label ?? value;
  },

  // The email record: required fields always get a line; optional ones only
  // when they carry a value.
  includeInEmail: (f) => {
    return !f.optional || !!f.value?.value;
  },

  // `is_custom` is checked before the value itself, so a blank custom value
  // still reads "Egyedi: " — unlike formatValue, which hides the empty state.
  formatForEmail: (f, _ctx) => {
    if (f.value?.is_custom) {
      return `Egyedi: ${f.value.value}`;
    }
    const label = f.items?.find((option) => option?.value === f.value?.value)?.label;
    return label ?? f.value?.value ?? "";
  },
});
