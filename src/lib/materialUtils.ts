import type { ProductItem, ProductMaterialResolved } from "./types.svelte";

function resolveValue(name: string, product: Pick<ProductItem, "fields">): number | undefined {
    const current = product.fields?.find((f) => f.name === name)?.value?.value;

    if (!current) {
        return undefined;
    }

    const val = Number.parseFloat(current);

    if (Number.isNaN(val)) {
        return undefined;
    }

    return val;
}

export function generateColorCount(
    material: ProductMaterialResolved,
    product: Pick<ProductItem, "fields">
): number | undefined {
    if (material.color_count === undefined) {
        return 1;
    }

    const val = Number.parseFloat(material.color_count);

    if (Number.isNaN(val)) {
        return resolveValue(material.color_count, product);
    }

    return val;
}
