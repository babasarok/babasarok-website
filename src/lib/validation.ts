import type { Product } from "./Product.svelte";
import type { ProductMaterial } from "./ProductMaterial.svelte";
import type { Field, ProductMaterialValue } from "./types.svelte";

export function nonEmptyObject<T extends Record<string, any>>(obj: T): obj is Exclude<T, Record<string, never>> {
    return Object.keys(obj).length > 0;
}

function prefillField(field: Field): void {
    switch (field.type) {
        case "toggle": {
            if (field.value?.value === undefined) {
                field.value = { value: "false" };
            }
        }
    }
}

export function sanitizeItem(item: Product): Product {
    // Prefill fields with default values if not set, to make sure validation and price calculation work correctly
    for (const field of item.fields ?? []) {
        prefillField(field);
    }

    for (const material of item.material_values ?? []) {
        const materialInfo = item.materials.find((m) => m.material.material_id === material.material_id);
        // Resolving failed, bail, or we are using custom color, in which case we don't know if we need a limit.
        if (materialInfo?.color_count == null || material.custom_color) {
            continue;
        }

        if (material.colors.length > materialInfo.color_count) {
            material.colors = material.colors.slice(0, materialInfo.color_count);
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

                break;
            }
            case "input": {
                if (item.optional) {
                    break;
                }
                item.value.error = "Kötelező mező";
                break;
            }
        }
        return;
    }

    if (item.regex) {
        const regex = new RegExp(item.regex);
        if (!regex.test(item.value.value)) {
            item.value.error = "Érvénytelen formátum";
        }
    }

    switch (item.type) {
        case "input": {
            break;
        }
        case "select":
        case "color":
        case "radio": {
            if (item.value.is_custom) {
                break;
            }

            const items = item.items;
            if (items && !items.some((option) => option.value === item.value?.value)) {
                item.value.error = "Érvénytelen érték";
            }
            break;
        }
    }
}

function updateMaterialWithErrors(value: ProductMaterialValue, material: ProductMaterial): void {
    value.error = undefined;

    if (!value.material_id) {
        value.error = "Kötelező mező";
        return;
    }

    if (!!value.custom_color) {
        return;
    }

    const colorCount = material.color_count;
    if (!colorCount) {
        value.error = "Színt nem lehet választani, más érték még nincs megadva";
        return;
    }

    if (value.colors.length < colorCount) {
        value.error = `${colorCount} színt kell választani`;
    }
}

function updateMaterialsWithErrors(item: Product): void {
    if (item.materials.length === 0) {
        return;
    }

    if (item.material_values.length < item.material_required_count) {
        for (let i = item.material_values.length; i < item.material_required_count; i++) {
            item.material_values.push({ material_id: "", colors: [] });
        }
    }

    item.material_values?.forEach((materialValue) => {
        const materialInfo = item.materials.find((m) => m.material.material_id === materialValue.material_id);
        if (materialInfo) {
            updateMaterialWithErrors(materialValue, materialInfo);
        } else {
            materialValue.error = "Kötelező mező";
        }
    });
}

export function validateItem(item: Product): Product {
    item.fields?.forEach((field) => {
        updateFieldWithErrors(field);
    });

    updateMaterialsWithErrors(item);
    return item;
}
