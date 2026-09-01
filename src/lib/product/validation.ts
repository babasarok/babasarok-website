import { resolveColorCount } from "./materials";
import type { CmsProductMaterial, Field, IProduct } from "../types.svelte";
import type { ProductMaterialValue } from "../types.svelte";
import { isFieldVisible } from "./fieldVisibility";

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

  for (const material of item.materials.values) {
    if (!material) {
      continue;
    }

    const materialInfo = item.materials.materials.find(
      (m) => m?.material_path.material_id === material.material_id
    );

    if (!materialInfo) {
      continue;
    }

    const count = resolveColorCount(materialInfo, item);
    // Resolving failed, bail, or we are using custom color, in which case we don't know if we need a limit.
    if (count == null || material.custom_color) {
      continue;
    }

    if (material.colors.length > count) {
      material.colors = material.colors.slice(0, count);
    }
  }
  return item;
}

function updateFieldWithErrors(item: Field): void {
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

    if (!item.value.color.color && !item.value.color.custom_color) {
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
  material: CmsProductMaterial,
  product: IProduct
): void {
  value.error = undefined;

  if (!value.material_id) {
    value.error = "Kötelező mező";
    return;
  }

  if (value.custom_color) {
    return;
  }

  const count = resolveColorCount(material, product);
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
  if (item.materials.materials.length === 0) {
    return;
  }

  for (let i = 0; i < item.materials.material_required_count; i++) {
    if (item.materials.values[i]) {
      continue;
    }

    item.materials.values[i] = { material_id: "", colors: [] };
  }

  for (const materialValue of item.materials.values) {
    if (!materialValue) {
      continue;
    }

    if (!materialValue.material_id) {
      materialValue.error = "Kötelező mező";
      continue;
    }

    const materialInfo = item.materials.materials.find(
      (m) => !!m && m.material_path.material_id === materialValue.material_id
    );

    if (materialInfo) {
      updateMaterialWithErrors(materialValue, materialInfo, item);
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
    updateFieldWithErrors(field);
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

  if (item.materials.materials.length === 0) {
    return true;
  }

  if (item.materials.values.length < item.materials.material_required_count) {
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
