import type { FieldInternal, ProductItem } from "./types";

function prefillField(field: FieldInternal): void {
    switch (field.type) {
        case "toggle": {
            if (field.value?.value === undefined) {
                field.value = { value: "false" };
            }
        }
    }
}

function updateFieldWithErrors(item: FieldInternal): void {
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

function updateWithErrors(item: ProductItem): void {}
