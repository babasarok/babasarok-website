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

function getMaterialPrice(
  value: Pick<ProductMaterialValue, "material_id">,
  productMaterials: ProductMaterial[],
  material_count: number,
  material_index: number
): PricePart | null {
  const material = productMaterials.find((m) => m.material.material_id === value.material_id);

  const materialPrice = material?.price;
  return {
    label: material_count > 1 ? `Anyag ${material_index + 1}` : "Anyag",
    price: materialPrice,
  };
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

  if (product.materials && product.materials.materials.length > 0) {
    for (let i = 0; i < (product.materials.material_required_count ?? 1); i++) {
      const value = product.materials.values?.[i];
      const price = getMaterialPrice(
        value ?? { material_id: "" },
        product.materials.materials,
        product.materials.material_required_count ?? 1,
        i
      );
      if (!price) {
        continue;
      }
      parts.push(price);
    }
  }

  const basePrice: PricePart = { label: "Alapár", price: product.price };
  const unitPrice = Math.round(
    [basePrice, ...parts].reduce((sum, part) => sum + Math.round(part.price ?? 0), 0)
  );
  const indeterminate =
    parts.some((part) => part.price === undefined) || product.price === undefined;
  const discountMultiplier =
    product.discount && product.discount_valid_until && new Date() <= product.discount_valid_until
      ? 1 - product.discount / 100
      : undefined;
  const totalPrice =
    unitPrice * product.count * (discountMultiplier !== undefined ? discountMultiplier : 1);

  if (product.priced_by_length) {
    let length: number | undefined = Number.parseFloat(
      product.fields?.find((x) => x.length_based_pricing_source)?.value?.value ?? ""
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
