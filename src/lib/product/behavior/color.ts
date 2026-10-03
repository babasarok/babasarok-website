import { defineBehavior } from "./index";

/**
 * Behaviour of the `color` field type: one required choice from the field's
 * `items` (the colour swatches), or (with `allow_custom_value`) a buyer-entered
 * custom value. Like `radio` it has no `optional` escape — a visible color
 * field must carry a selection to pass validation.
 *
 * In the pre-registry code `radio`, `select` and `color` shared a single
 * `switch (field.type)` case at every site; this module ports that shared case
 * for `color` standalone (each sibling type's module does the same for itself),
 * extracted verbatim from `product/validation.ts` (normalize / validate /
 * hasError / clearErrors), `product/field.ts` (resolveValue),
 * `pricing/price.ts` (price), `pricing/validCombinations.ts` (enumerate),
 * `order/queryParams.ts` (fillFromParams), `order/storage.ts` (toSaved),
 * `order/submit.ts` (includeInEmail / formatForEmail) and
 * `components/blocks/order/CheckoutItem.svelte` (formatValue).
 */
export const colorBehavior = defineBehavior("color", {
  // String-valued fields are left untouched by sanitize: they hold no value
  // until the buyer acts, and validation prefill happens on submit.
  normalize: (f, _ctx) => {
    void f;
  },
  // The scalar for cross-field references: the string value, or `undefined`
  // when absent/blank.
  resolveValue: (f) => {
    const value = f.value?.value;
    return value === "" ? undefined : value;
  },
  // Always a part, even with nothing selected: an unpriced part shows as
  // "??Ft" in the email breakdown instead of dropping the line.
  price: (f) => {
    const items = f.items;
    const selectedItem = items?.find((item) => !!item && item.value === f.value?.value);
    return { label: f.label || f.name, price: selectedItem?.price ?? undefined };
  },
  // One shape per offered choice, plus the custom sentinel when
  // `allow_custom_value` is set (it passes the required check and prices at 0,
  // since no item matches it).
  enumerate: (f) => {
    const choices = (f.items ?? [])
      .filter((item) => item != null)
      .map((item) => ({ ...f, value: { value: item.value } }));
    if (f.allow_custom_value) {
      choices.push({ ...f, value: { value: "__custom__" } });
    }
    return choices;
  },
  // An unknown value WITHOUT `allow_custom_value` is still kept — it is
  // re-judged later by validation, exactly like a normal selection.
  fillFromParams: (f, raw) => {
    const matchesOption = f.items?.some((item) => item?.value === raw);
    const isCustom = !matchesOption && !!f.allow_custom_value;
    f.value = isCustom ? { value: raw, is_custom: true } : { value: raw };
  },
  toSaved: (f) => {
    return f.value
      ? {
          value: f.value.value,
          ...(f.value.is_custom == null ? {} : { is_custom: f.value.is_custom }),
        }
      : undefined;
  },
  validate: (f, _ctx) => {
    // prefill if we are submitting
    f.value ??= { value: "" };

    f.value.error = undefined;
    if (!f.value.value) {
      f.value.error = "Kötelező mező";
      return;
    }

    if (f.regex) {
      const regex = new RegExp(f.regex);
      if (!regex.test(f.value.value)) {
        f.value.error = "Érvénytelen formátum";
        return;
      }
    }

    if (f.value.is_custom) {
      return;
    }

    const items = f.items;
    // Only validate membership for a *non-empty* value, otherwise this would
    // overwrite the more helpful "Kötelező mező" set above for empty fields.
    if (
      f.value.value &&
      items &&
      !items.some((option) => option && option.value === f.value?.value)
    ) {
      f.value.error = "Érvénytelen érték";
      return;
    }
  },
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
  includeInEmail: (f) => {
    return !f.optional || !!f.value?.value;
  },
  formatForEmail: (f, _ctx) => {
    // Checked FIRST: a blank custom value still reads "Egyedi: " — the record
    // represents the empty state rather than hiding it.
    if (f.value?.is_custom) {
      return `Egyedi: ${f.value.value}`;
    }
    const label = f.items?.find((option) => option?.value === f.value?.value)?.label;
    return label ?? f.value?.value ?? "";
  },
});
