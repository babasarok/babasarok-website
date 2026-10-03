import { defineBehavior } from "./index";

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export const embroideryBehavior = defineBehavior("embroidery", {
  normalize: (f, _ctx) => {
    f.value ??= { enabled: false, text: { value: "" }, color: { color: "" } };
  },

  resolveValue: () => {
    return;
  },

  price: (f) => {
    if (!f.value?.enabled) {
      return;
    }
    const multiplier = f.price_unit === "word" ? countWords(f.value.text.value) : 1;
    return {
      label: f.label || f.name,
      price: f.price == null ? undefined : f.price * multiplier,
    };
  },

  enumerate: (f) => [f],

  fillFromParams: (f, raw) => {
    // The deep link enables the field and sets its text; the thread colour
    // arrives via the separate `_color` companion, handled by the caller.
    f.value ??= { enabled: true, text: { value: "" }, color: { color: "" } };
    f.value.enabled = true;
    f.value.text = { value: raw };
  },

  toSaved: (f) =>
    f.value
      ? {
          enabled: f.value.enabled,
          text: { value: f.value.text.value },
          color: { color: f.value.color.color },
        }
      : undefined,

  validate: (f, _ctx) => {
    f.value ??= { enabled: false, text: { value: "" }, color: { color: "" } };
    f.value.error = undefined;
    f.value.text.error = undefined;
    f.value.color.error = undefined;

    if (!f.value.enabled) {
      return;
    }

    if (!f.value.text.value) {
      f.value.text.error = "Kötelező mező";
    } else if (f.regex) {
      const regex = new RegExp(f.regex);
      if (!regex.test(f.value.text.value)) {
        f.value.text.error = "Érvénytelen formátum";
      }
    }

    if (!f.value.color.color) {
      f.value.color.error = "Kötelező mező";
    }
  },

  hasError: (f) =>
    f.value ? !!f.value.error || !!f.value.text.error || !!f.value.color.error : false,

  clearErrors: (f) => {
    if (!f.value) {
      return;
    }
    f.value.error = undefined;
    f.value.text.error = undefined;
    f.value.color.error = undefined;
  },

  formatValue: (f, ctx) => {
    if (!f.value?.enabled) {
      return;
    }
    const color = ctx.threadColors?.find((c) => c.color_id === f.value?.color.color);
    const colorLabel = color?.label ?? f.value.color.color;
    const text = f.value.text.value.trim();
    return colorLabel ? `${text} (${colorLabel})`.trim() : text;
  },

  includeInEmail: (f) => f.value?.enabled ?? false,

  formatForEmail: (f, ctx) => {
    const color = ctx.threadColors?.find((c) => c.color_id === f.value?.color.color);
    const colorLabel = color?.label ?? f.value?.color.color ?? "";
    return `${f.value?.text.value ?? ""} (${colorLabel})`;
  },
});
