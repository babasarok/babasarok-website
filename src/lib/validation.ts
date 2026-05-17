import type { Product } from "./Product.svelte";
import type { Field } from "./types.svelte";

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

function updateFieldWithErrors(item: Field): void {
    // Was not edited by user, can be ignored for displaying errors
    if (!item.value) {
        return;
    }

    item.value.error = undefined;
    if (!item.value.value) {
        item.value.error = "Cannot be empty";
        return;
    }

    if (item.regex) {
        const regex = new RegExp(item.regex);
        if (!regex.test(item.value.value)) {
            item.value.error = "Invalid format";
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
                item.value.error = "Invalid value";
            }
            break;
        }
    }
}

export function prefillItem(item: Product): void {}

export function validateItem(item: Product): void {
    item.fields?.forEach((field) => {
        prefillField(field);
        updateFieldWithErrors(field);
    });
}
