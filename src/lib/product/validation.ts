import {
  bannedCombinationIds,
  bannedMaterialFieldNames,
  isMaterialInOption,
  resolveColorCount,
} from "./materials";
import type { Field, IProduct } from "../types.svelte";
import { isFieldVisible } from "./field";

const emptyEmbroideryValue = {
  enabled: false,
  text: { value: "" },
  color: { color: "" },
};

function prefillField(field: Field): void {
  switch (field.type) {
    case "toggle": {
      if (field.value?.value === undefined) {
        field.value = { value: false };
      }
      return;
    }
    case "embroidery": {
      field.value ??= structuredClone(emptyEmbroideryValue);
      return;
    }
    case "material": {
      field.value ??= { material_id: "", colors: [] };
      return;
    }
  }
}

export function sanitizeItem(item: IProduct): IProduct {
  // Prefill fields with default values if not set, to make sure validation and price calculation work correctly
  for (const field of item.fields) {
    prefillField(field);

    if (field.type === "material") {
      if (!field.value?.material_id) {
        continue;
      }

      const count = resolveColorCount(field, item);
      // Resolving failed, bail.
      if (count == null) {
        continue;
      }

      if (field.value.colors.length > count) {
        field.value.colors = field.value.colors.slice(0, count);
      }
    }
  }
  return item;
}

function updateFieldWithErrors(product: IProduct, item: Field, banned: string[][]): void {
  if (item.type === "material") {
    // A material field needs the full product: `color_count` may name another
    // field, and the banned-combination rule spans all material fields.
    item.value ??= { material_id: "", colors: [] };
    item.value.error = undefined;
    // Backstop for every path that can set a material (deep links, restored
    // baskets, future callers): an id the field does not offer counts as no
    // selection, mirroring the basket-restore membership check.
    if (!item.value.material_id || !isMaterialInOption(item, item.value.material_id)) {
      item.value.error = "Kötelező mező";
      return;
    }
    const count = resolveColorCount(item, product);
    if (!count) {
      item.value.error = "Színt nem lehet választani, más érték még nincs megadva";
      return;
    }
    if (item.value.colors.length < count) {
      item.value.error = `${count == 1 ? "" : count.toString()} színt kell választani`;
      return;
    }
    // Once the selection is otherwise complete, flag every field whose
    // material completes a banned combination (form-level enforcement).
    if (bannedMaterialFieldNames(product.fields, banned).has(item.name)) {
      item.value.error = "Ez az anyagkombináció nem rendelhető";
    }
    return;
  }

  if (item.type === "toggle") {
    // A toggle always holds a boolean, so there is nothing to require.
    item.value ??= { value: false };
    item.value.error = undefined;
    return;
  }

  if (item.type === "embroidery") {
    item.value ??= structuredClone(emptyEmbroideryValue);
    item.value.error = undefined;
    item.value.text.error = undefined;
    item.value.color.error = undefined;

    if (!item.value.enabled) {
      return;
    }

    if (!item.value.text.value) {
      item.value.text.error = "Kötelező mező";
    } else if (item.regex) {
      const regex = new RegExp(item.regex);
      if (!regex.test(item.value.text.value)) {
        item.value.text.error = "Érvénytelen formátum";
      }
    }

    if (!item.value.color.color) {
      item.value.color.error = "Kötelező mező";
    }
    return;
  }

  // prefill if we are submitting
  item.value ??= { value: "" };

  item.value.error = undefined;
  if (!item.value.value) {
    switch (item.type) {
      case "select":
      case "color":
      case "radio": {
        item.value.error = "Kötelező mező";
        return;
      }
      case "input": {
        if (item.optional) {
          break;
        }
        item.value.error = "Kötelező mező";
        return;
      }
    }
  }

  if (item.regex) {
    const regex = new RegExp(item.regex);
    if (!regex.test(item.value.value)) {
      item.value.error = "Érvénytelen formátum";
      return;
    }
  }

  switch (item.type) {
    case "input": {
      return;
    }
    case "select":
    case "color":
    case "radio": {
      if (item.value.is_custom) {
        return;
      }

      const items = item.items;
      // Only validate membership for a *non-empty* value, otherwise this would
      // overwrite the more helpful "Kötelező mező" set above for empty fields.
      if (
        item.value.value &&
        items &&
        !items.some((option) => option && option.value === item.value?.value)
      ) {
        item.value.error = "Érvénytelen érték";
        return;
      }
      return;
    }
  }
}

function clearFieldErrors(field: Field): void {
  if (!field.value) {
    return;
  }
  if (field.type === "embroidery") {
    field.value.error = undefined;
    field.value.text.error = undefined;
    field.value.color.error = undefined;
    return;
  }
  field.value.error = undefined;
}

function fieldHasError(field: Field): boolean {
  if (!field.value) {
    return false;
  }
  if (field.type === "embroidery") {
    return !!field.value.error || !!field.value.text.error || !!field.value.color.error;
  }
  return !!field.value.error;
}

export function validateItem(item: IProduct): IProduct {
  // The banned-combination rule spans all material fields, so resolve the
  // product's banned id multisets once instead of per field.
  const banned = bannedCombinationIds(item);
  for (const field of item.fields) {
    // Hidden dependent fields must not block submission; clear any stale error.
    if (!isFieldVisible(field, item.fields)) {
      clearFieldErrors(field);
      continue;
    }
    updateFieldWithErrors(item, field, banned);
  }

  return item;
}

export function isItemValid(item: IProduct): boolean {
  for (const field of item.fields) {
    if (isFieldVisible(field, item.fields) && fieldHasError(field)) {
      return false;
    }
  }

  return true;
}
