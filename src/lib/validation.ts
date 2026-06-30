import { resolveColorCount } from "./materialUtils";
import type { CmsProductMaterial, Field, IProduct } from "./types.svelte";
import type { ProductMaterialValue } from "./types.svelte";

function prefillField(field: Field): void {
  switch (field.type) {
    case "toggle": {
      if (field.value?.value === undefined) {
        field.value = { value: "false" };
      }
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
  // prefill if we are submitting
  item.value ??= { value: "" };

  item.value.error = undefined;
  if (!item.value.value) {
    switch (item.type) {
      case "select":
      case "color":
      case "toggle":
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

  if (item.materials.values.length < item.materials.material_required_count) {
    for (let i = item.materials.values.length; i < item.materials.material_required_count; i++) {
      item.materials.values.push({ material_id: "", colors: [] });
    }
  }

  for (const materialValue of item.materials.values) {
    if (!materialValue) {
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
    updateFieldWithErrors(field);
  }

  updateMaterialsWithErrors(item);
  return item;
}

export function isItemValid(item: IProduct): boolean {
  for (const field of item.fields) {
    if (field.value?.error) {
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
    if (field.value?.error) {
      return false;
    }
  }

  return true;
}
