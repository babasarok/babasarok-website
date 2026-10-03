import { defineBehavior } from "./index";

export const selectBehavior = defineBehavior("select", {
  normalize: (f, _ctx) => {
    void f;
  },

  resolveValue: (f) => {
    const value = f.value?.value;
    return typeof value === "string" && value !== "" ? value : undefined;
  },

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
