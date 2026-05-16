import type { Material } from "../../tina/materials";
import type { Field, Product, ProductItem, ProductMaterial, ProductMaterialValue, RadioField, SelectField } from "../../tina/products";

interface PricePart {
    label: string;
    price: number | undefined;
}

interface Price {
    parts: PricePart[];
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
                price:
                    field.value?.value === undefined
                        ? undefined
                        : field.value?.value === "true"
                            ? field.price
                            : 0,
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

function getMaterialPrice(value: ProductMaterialValue, productMaterials: ProductMaterial[], materialInfo: Material[]): PricePart | null {
    const material = productMaterials.find(
        (m) => m. === value.material_id
    );
}


function calculatePriceForItem(
    product: ProductItem,
    materials: Material[]
) {
    let priceParts: PricePart[] = [];
    priceParts.push({ label: "Alapár", price: product.price });
    for (const field of product.fields ?? []) {
        const fieldPrice = getFieldPrice(field);
        if (!fieldPrice) {
            continue;
        }
        priceParts.push(fieldPrice);
    }

    if (product.materials && product.materials.length > 0) {
        for (let i = 0; i < (product.material_required_count ?? 1); i++) {
            const material = product.material_values?.[i];
            const price = product.materials.find(
                (m) => m.material_path === `data/materials/${material?.material_id}.json`
            )?.price;
            priceParts.push({
                label: (product.material_required_count ?? 1) == 1 ? "Anyag" : `Anyag ${i + 1}`,
                price: price,
            });
        }
    }

    const unitPrice = priceParts.reduce((sum, part) => sum + (part.price ?? 0), 0);



}
