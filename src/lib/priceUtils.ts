import type { Product } from "./Product.svelte";
import type { ProductMaterial } from "./ProductMaterial.svelte";
import type { Field, ProductMaterialValue, RadioField, SelectField } from "./types.svelte";

interface PricePart {
    label: string;
    price: number | undefined;
}

interface BasePrice {
    basePrice: PricePart;
    options: PricePart[];
    unitPrice: number;
    totalPrice: number;
    indeterminate: boolean;
}

export interface Price extends BasePrice {
    priced_by_length: false;
}

export interface LengthBasedPrice extends BasePrice {
    priced_by_length: true;
    length: number | undefined;
}

function getFieldPrice(field: Field): PricePart | null {
    if (field.length_based_pricing_source) {
        return null;
    }

    switch (field.type) {
        case "radio":
        case "color":
        case "select": {
            const items = (field as RadioField | SelectField).items;
            const selectedItem = items?.find((item) => item.value === field.value?.value);
            return { label: field.label || field.name, price: selectedItem?.price };
        }
        case "toggle": {
            return {
                label: field.label || field.name,
                price: field.value?.value === undefined ? undefined : field.value?.value === "true" ? field.price : 0,
            };
        }
        case "input": {
            return {
                label: field.label || field.name,
                price: field.price,
            };
        }
    }
}

function getMaterialPrice(
    value: Pick<ProductMaterialValue, "material_id">,
    productMaterials: ProductMaterial[],
    material_count: number,
    material_index: number
): PricePart | null {
    const material = productMaterials.find((m) => m.material.material_id === value.material_id);

    const materialPrice = material?.price;
    return { label: material_count > 1 ? `Anyag ${material_index + 1}` : "Anyag", price: materialPrice };
}

export function calculatePriceForItem(product: Product): Price | LengthBasedPrice {
    let parts: PricePart[] = [];
    for (const field of product.fields ?? []) {
        const fieldPrice = getFieldPrice(field);
        if (!fieldPrice) {
            continue;
        }
        parts.push(fieldPrice);
    }

    if (product.materials && product.materials.length > 0) {
        for (let i = 0; i < (product.material_required_count ?? 1); i++) {
            const value = product.material_values?.[i];
            const price = getMaterialPrice(
                value ?? { material_id: "" },
                product.materials,
                product.material_required_count ?? 1,
                i
            );
            if (!price) {
                continue;
            }
            parts.push(price);
        }
    }

    const basePrice: PricePart = { label: "Alapár", price: product.price };
    const unitPrice = Math.round([basePrice, ...parts].reduce((sum, part) => sum + Math.round(part.price ?? 0), 0));
    const indeterminate = parts.some((part) => part.price === undefined) || product.price === undefined;
    const totalPrice = unitPrice * product.count;

    if (product.priced_by_length) {
        const length = Number.parseFloat(
            product.fields?.find((x) => x.length_based_pricing_source)?.value?.value ?? ""
        );
        return {
            priced_by_length: true,
            length: Number.isNaN(length) ? undefined : length,
            options: parts,
            unitPrice,
            totalPrice,
            basePrice,
            indeterminate,
        };
    }

    return {
        options: parts,
        unitPrice,
        totalPrice,
        priced_by_length: false,
        basePrice,
        indeterminate,
    };
}
