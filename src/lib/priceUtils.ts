import type { IProduct, Field, CmsProductMaterial } from "./Product.svelte";
import type { ProductMaterialValue } from "./types.svelte";

interface PricePart {
  label: string;
  price: number | undefined;
}

interface BasePrice {
  basePrice: PricePart;
  options: PricePart[];
  unitPrice: number | undefined;
  totalPrice: number | undefined;
  indeterminate: boolean;
  discount: number | undefined;
}

export interface Price extends BasePrice {
  priced_by_length: false;
}

export interface LengthBasedPrice extends BasePrice {
  priced_by_length: true;
  length: number | undefined;
  per_meter_price: number | undefined;
}

function getFieldPrice(field: Field): PricePart | null {
  if (field.length_based_pricing_source) {
    return null;
  }

  switch (field.type) {
    case "radio":
    case "color":
    case "select": {
      const items = field.items;
      const selectedItem = items?.find((item) => !!item && item.value === field.value?.value);
      return { label: field.label || field.name, price: selectedItem?.price ?? undefined };
    }
    case "toggle": {
      return {
        label: field.label || field.name,
        price:
          field.value?.value === undefined
            ? undefined
            : field.value.value === "true"
              ? (field.price ?? undefined)
              : 0,
      };
    }
    case "input": {
      return {
        label: field.label || field.name,
        price: field.price ?? undefined,
      };
    }
    default: {
      return null;
    }
  }
}

function getMaterialPrice(
  value: Pick<ProductMaterialValue, "material_id">,
  productMaterials: CmsProductMaterial[],
  material_count: number,
  material_index: number
): PricePart | null {
  const material = productMaterials.find((m) => m?.material_path.material_id === value.material_id);

  const materialPrice = material?.price;
  return {
    label: material_count > 1 ? `Anyag ${(material_index + 1).toString()}` : "Anyag",
    price: materialPrice ?? undefined,
  };
}

export function calculatePriceForItem(product: IProduct): Price | LengthBasedPrice {
  const parts: PricePart[] = [];
  for (const field of product.fields) {
    const fieldPrice = getFieldPrice(field);
    if (!fieldPrice) {
      continue;
    }
    parts.push(fieldPrice);
  }

  if ((product.materials.materials?.length ?? 0) > 0) {
    for (let i = 0; i < (product.materials.material_required_count ?? 1); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const value = product.materials.values?.[i];
      const price = getMaterialPrice(
        value ?? { material_id: "" },
        product.materials.materials ?? [],
        product.materials.material_required_count ?? 1,
        i
      );
      if (!price) {
        continue;
      }
      parts.push(price);
    }
  }

  const basePrice: PricePart = { label: "Alapár", price: product.price ?? undefined };
  const unitPrice = Math.round(
    [basePrice, ...parts].reduce((sum, part) => sum + Math.round(part.price ?? 0), 0)
  );
  const indeterminate = parts.some((part) => part.price === undefined) || product.price === null;
  const discountMultiplier =
    product.discount &&
    product.discount_valid_until &&
    new Date() <= new Date(product.discount_valid_until)
      ? 1 - product.discount / 100
      : undefined;
  const totalPrice =
    unitPrice * product.count * (discountMultiplier === undefined ? 1 : discountMultiplier);

  if (product.priced_by_length) {
    let length: number | undefined = Number.parseFloat(
      product.fields.find((x) => x.length_based_pricing_source)?.value?.value ?? ""
    );

    length = Number.isNaN(length) ? undefined : length / 100;

    return {
      priced_by_length: true,
      length,
      options: parts,
      unitPrice: length === undefined ? undefined : unitPrice * length,
      per_meter_price: unitPrice,
      totalPrice: length === undefined ? undefined : totalPrice * length,
      basePrice,
      indeterminate,
      discount: discountMultiplier,
    };
  }

  return {
    options: parts,
    unitPrice,
    totalPrice,
    priced_by_length: false,
    basePrice,
    indeterminate,
    discount: discountMultiplier,
  };
}
