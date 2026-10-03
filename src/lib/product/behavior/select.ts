import { defineBehavior } from "./index";

/**
 * The `select` behaviour: one required choice from the field's `items` (there
 * is no `optional` escape), with a buyer-entered custom value where
 * `allow_custom_value` is set.
 *
 * The switch sites this logic was extracted from share one case across
 * `select` / `radio` / `color`; the shared logic is carried per behaviour
 * module rather than imported from a sibling, so this file is standalone.
 */
export const selectBehavior = defineBehavior("select", {
  // String-valued fields are left untouched by sanitize: `prefillField` has no
  // select case — the field holds no value until the buyer acts, and validation
  // prefill happens on submit.
  normalize: (f, _ctx) => {
    void f;
  },
  resolveValue: (f) => {
    const value = f.value?.value;
    return typeof value === "string" && value !== "" ? value : undefined;
  },
  // Always a part, even with nothing selected: a present-but-unpriced part
  // renders as "??Ft" in the email breakdown.
  price: (f) => {
    const items = f.items;
    const selectedItem = items?.find((item) => !!item && item.value === f.value?.value);
    return { label: f.label || f.name, price: selectedItem?.price ?? undefined };
  },
  enumerate: (f) => {
    const choices = (f.items ?? [])
      .filter((item) => item != null)
      .map((item) => ({ ...f, value: { value: item.value } }));
    if (f.allow_custom_value) {
      choices.push({ ...f, value: { value: "__custom__" } });
    }
    return choices;
  },
  fillFromParams: (f, raw) => {
    // An unknown value without `allow_custom_value` is still kept — validation
    // re-judges it later, the same way as a normal selection.
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
      // Unlike `input`, a select has no `optional` escape: it is always required.
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
    return;
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
    // Custom wins even when the text is blank: the record reads "Egyedi: ".
    if (f.value?.is_custom) {
      return `Egyedi: ${f.value.value}`;
    }

    const label = f.items?.find((option) => option?.value === f.value?.value)?.label;
    return label ?? f.value?.value ?? "";
  },
});
