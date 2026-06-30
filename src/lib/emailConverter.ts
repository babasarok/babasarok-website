import { calculatePriceForItem } from "@/lib/priceUtils";
import type { IProduct } from "@/lib/types.svelte";
import type { CmsDeliveryMethod } from "./data";

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
  ár: number | undefined;
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

export function generatePriceData(
  product: IProduct
): ReadablePriceData | ReadableLengthBasedPriceData {
  const price = calculatePriceForItem(product);
  if (price.priced_by_length) {
    return {
      hossz_alapú: true,
      alapár: price.basePrice.price,
      tételek: price.options.map((option) => ({
        tétel: option.label,
        ár: option.price,
      })),
      egységár: price.unitPrice,
      összár: price.totalPrice,
      kedvezmény: price.discount ? `${((1 - price.discount) * 100).toFixed(2)}%` : undefined,
      hossz_méter: price.length,
      méterár: price.per_meter_price,
      nem_teljes_ár: price.indeterminate,
    };
  }

  return {
    hossz_alapú: false,
    alapár: price.basePrice.price,
    tételek: price.options.map((option) => ({
      tétel: option.label,
      ár: option.price,
    })),
    egységár: price.unitPrice,
    összár: price.totalPrice,
    kedvezmény: price.discount ? `${((1 - price.discount) * 100).toFixed(2)}%` : undefined,
    nem_teljes_ár: price.indeterminate,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function generateProductData(product: IProduct) {
  const result: ReadableProductData = {
    név: product.title,
    kedvezmény:
      product.discount &&
      (product.discount_valid_until ? new Date() < new Date(product.discount_valid_until) : true)
        ? product.discount
        : undefined,
    ár: generatePriceData(product),
    darabszám: product.count,
  };

  if (product.materials.materials.length > 0 && product.materials.material_required_count > 0) {
    result.anyagok = product.materials.values.map((mv) => {
      const material = product.materials.materials.find(
        (m) => m?.material_path.material_id === mv?.material_id
      );
      const res: ReadableMaterialData = {
        név: material?.material_path.label ?? mv?.material_id ?? "Ismeretlen anyag",
        ár: material?.price ?? undefined,
      };

      if (mv?.custom_color) {
        res.egyedi_szín = mv.custom_color;
        return res;
      } else {
        res.színek =
          mv?.colors.map(
            (x) => material?.material_path.colors?.find((c) => c?.color_id === x)?.label ?? x
          ) ?? [];
      }

      return res;
    });
  }

  result.opciók = product.fields
    .filter((f) => !("optional" in f) || !f.optional)
    .map((f) => {
      const label =
        "items" in f
          ? f.items?.find((option) => option?.value === f.value?.value)?.label
          : undefined;
      return {
        név: f.label,
        érték: label ?? f.value?.value ?? "",
        egyedi: f.value?.is_custom ?? false,
        ár: f.length_based_pricing_source ? 0 : (f.price ?? undefined), // length based pricing options don't have a price here, as the price is calculated in the price data
      };
    });

  return result;
}

export interface OrderEmailData {
  név: string;
  email: string;
  telefonszám: string;
  szállítási_mód: { név: string; ár: number };
  termékek: ReadableProductData[];
  ár: { összár: number; nem_teljes_ár: boolean };
}

export function generateFormData(
  name: string,
  email: string,
  phone: string,
  deliveryMethod: CmsDeliveryMethod,
  products: IProduct[]
): OrderEmailData {
  const productData = products.map((p) => generateProductData(p));
  return {
    név: name,
    email: email,
    telefonszám: phone,
    szállítási_mód: {
      név: deliveryMethod.name,
      ár: deliveryMethod.price,
    },
    termékek: productData,
    ár: {
      összár: productData.reduce((sum, p) => sum + (p.ár.összár ?? 0), 0) + deliveryMethod.price,
      nem_teljes_ár: productData.some((p) => p.ár.nem_teljes_ár),
    },
  };
}
