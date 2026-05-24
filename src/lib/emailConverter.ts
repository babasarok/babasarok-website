import { calculatePriceForItem } from "./priceUtils";
import type { Product } from "./Product.svelte";

export interface ReadableMaterialData {
    név: string;
    ár: number | undefined;
    színek?: string[];
    egyedi_szín?: string;
}

export interface ReadableOptionData {
    név: string;
    érték: string;
    egyedi: boolean;
}

export interface ReadablePricePart {
    tétel: string;
    ár: number | undefined;
}

export interface ReadableBasePriceData {
    alapár: number | undefined;
    tételek: ReadablePricePart[];
    egységár: number | undefined;
    összár: number | undefined;
    kedvezmény: string | undefined;
    nem_teljes_ár: boolean;
}

export interface ReadablePriceData extends ReadableBasePriceData {
    hossz_alapú: false;
}

export interface ReadableLengthBasedPriceData extends ReadableBasePriceData {
    hossz_alapú: true;
    hossz_méter: number | undefined;
    méterár: number | undefined;
}

export interface ReadableProductData {
    név: string;
    kedvezmény: number | undefined;
    ár: ReadablePriceData | ReadableLengthBasedPriceData;
    darabszám: number;
    anyagok?: ReadableMaterialData[];
    opciók?: ReadableOptionData[];
}

export function generatePriceData(product: Product): ReadablePriceData | ReadableLengthBasedPriceData {
    const price = calculatePriceForItem(product);
    if (price.priced_by_length) {
        return {
            hossz_alapú: true,
            alapár: price.basePrice.price,
            tételek: price.options.map((option) => ({ tétel: option.label, ár: option.price })),
            egységár: price.unitPrice,
            összár: price.totalPrice,
            kedvezmény: price.discount ? `${(1 - price.discount) * 100}%` : undefined,
            hossz_méter: price.length,
            méterár: price.per_meter_price,
            nem_teljes_ár: price.indeterminate,
        };
    }

    return {
        hossz_alapú: false,
        alapár: price.basePrice.price,
        tételek: price.options.map((option) => ({ tétel: option.label, ár: option.price })),
        egységár: price.unitPrice,
        összár: price.totalPrice,
        kedvezmény: price.discount ? `${(1 - price.discount) * 100}%` : undefined,
        nem_teljes_ár: price.indeterminate,
    };
}

export function generateProductData(product: Product) {
    const serialised = product.serialise();

    const result: ReadableProductData = {
        név: serialised.name,
        kedvezmény:
            serialised.discount &&
            (serialised.discount_valid_until ? new Date() < serialised.discount_valid_until : true)
                ? serialised.discount
                : undefined,
        ár: generatePriceData(product),
        darabszám: serialised.count,
    };

    if (serialised.materials.length > 0 && serialised.material_required_count > 0) {
        result.anyagok = serialised.material_values.map((mv) => {
            const material = serialised.materials.find((m) => m.material.material_id === mv?.material_id);
            const res: ReadableMaterialData = {
                név: material?.material.label ?? mv?.material_id ?? "Ismeretlen anyag",
                ár: material?.price,
            };

            if (mv?.custom_color) {
                res.egyedi_szín = mv.custom_color;
                return res;
            } else {
                res.színek = mv?.colors ?? [];
            }

            return res;
        });
    }

    result.opciók = serialised.fields.map((f) => {
        const label = "items" in f ? f.items.find((option) => option.value === f.value?.value)?.label : "";
        return {
            név: f.label ?? f.name,
            érték: `${f.value?.value} ${label ? `(${label})` : ""}`,
            egyedi: f.value?.is_custom ?? false,
        };
    });

    return result;
}

export function generateFormData(name: string, email: string, phone: string, products: Product[]) {
    return {
        név: name,
        email: email,
        telefonszám: phone,
        termékek: products.map((p) => generateProductData(p)),
    };
}
