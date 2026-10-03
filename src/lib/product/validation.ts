import { resolveColorCount, isMaterialInOption } from "./materials";
import type { CmsProductMaterialOption, Field, IProduct } from "../types.svelte";
import type { ProductMaterialValue } from "../types.svelte";
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
  }
}

export function sanitizeItem(item: IProduct): IProduct {
  // Prefill fields with default values if not set, to make sure validation and price calculation work correctly
  for (const field of item.fields) {
    prefillField(field);
  }

  for (const [i, option] of item.materials.material_options.entries()) {
    const material = item.materials.values[i];
    if (!material) {
      continue;
    }

    const count = resolveColorCount(option, item);
    // Resolving failed, bail.
    if (count == null) {
      continue;
    }

    if (material.colors.length > count) {
      material.colors = material.colors.slice(0, count);
    }
  }
  return item;
}

function updateFieldWithErrors(product: IProduct, item: Field): void {
  if (item.type === "material") {
    // Mirror `updateMaterialWithErrors` for a material slot: it needs the full
    // product to resolve `color_count` (which may name another field).
    item.value ??= { material_id: "", colors: [] };
    item.value.error = undefined;
    if (!item.value.material_id) {
      item.value.error = "Kötelező mező";
      return;
    }
    const count = resolveColorCount({ color_count: item.color_count }, product);
    if (!count) {
      item.value.error = "Színt nem lehet választani, más érték még nincs megadva";
      return;
    }
    if (item.value.colors.length < count) {
      item.value.error = `${count == 1 ? "" : count.toString()} színt kell választani`;
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

function updateMaterialWithErrors(
  value: ProductMaterialValue,
  option: CmsProductMaterialOption,
  product: IProduct
): void {
  value.error = undefined;

  if (!value.material_id) {
    value.error = "Kötelező mező";
    return;
  }

  const count = resolveColorCount(option, product);
  if (!count) {
    value.error = "Színt nem lehet választani, más érték még nincs megadva";
    return;
  }

  if (value.colors.length < count) {
    value.error = `${count == 1 ? "" : count.toString()} színt kell választani`;
    return;
  }
}

function updateMaterialsWithErrors(item: IProduct): void {
  const options = item.materials.material_options;
  if (options.length === 0) {
    return;
  }

  for (let i = 0; i < options.length; i++) {
    if (item.materials.values[i]) {
      continue;
    }

    item.materials.values[i] = { material_id: "", colors: [] };
  }

  for (const [i, option] of options.entries()) {
    const materialValue = item.materials.values[i];
    if (!materialValue) {
      continue;
    }

    if (!materialValue.material_id) {
      materialValue.error = "Kötelező mező";
      continue;
    }

    if (isMaterialInOption(option, materialValue.material_id)) {
      updateMaterialWithErrors(materialValue, option, item);
    } else {
      materialValue.error = "Kötelező mező";
    }
  }
}

export function validateItem(item: IProduct): IProduct {
  for (const field of item.fields) {
    // Hidden dependent fields must not block submission; clear any stale error.
    if (!isFieldVisible(field, item.fields)) {
      clearFieldErrors(field);
      continue;
    }
    updateFieldWithErrors(item, field);
  }

  updateMaterialsWithErrors(item);
  return item;
}

export function isItemValid(item: IProduct): boolean {
  for (const field of item.fields) {
    if (isFieldVisible(field, item.fields) && fieldHasError(field)) {
      return false;
    }
  }

  if (item.materials.material_options.length === 0) {
    return true;
  }

  if (item.materials.values.length < item.materials.material_options.length) {
    return false;
  }

  for (const materialValue of item.materials.values) {
    if (materialValue?.error) {
      return false;
    }
  }

  for (const field of item.fields) {
    if (isFieldVisible(field, item.fields) && fieldHasError(field)) {
      return false;
    }
  }

  return true;
}
