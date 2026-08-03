import type { IProduct, Field, CmsProductMaterial } from "./types.svelte";
import type { ProductMaterialValue } from "./types.svelte";
import { isFieldVisible } from "./fieldVisibility";

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

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function getFieldPrice(field: Field, product: IProduct): PricePart | null {
  // Skip pricing for fields that are used as the source of length-based pricing
  if (product.length_based_pricing && field.name === product.length_based_pricing.sourceField) {
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
            : field.value.value
              ? (field.price ?? undefined)
              : 0,
      };
    }
    case "embroidery": {
      if (!field.value?.enabled) {
        return null;
      }
      const multiplier = field.price_unit === "word" ? countWords(field.value.text.value) : 1;
      return {
        label: field.label || field.name,
        price: field.price == null ? undefined : field.price * multiplier,
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

function stringFieldValue(field: Field | undefined): string | undefined {
  if (!field || field.type === "toggle" || field.type === "embroidery") {
    return undefined;
  }
  return field.value?.value;
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
    if (!isFieldVisible(field, product.fields)) {
      continue;
    }
    const fieldPrice = getFieldPrice(field, product);
    if (!fieldPrice) {
      continue;
    }
    parts.push(fieldPrice);
  }

  if (product.materials.materials.length > 0) {
    for (let i = 0; i < product.materials.material_required_count; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const value = product.materials.values?.[i];
      const price = getMaterialPrice(
        value ?? { material_id: "" },
        product.materials.materials,
        product.materials.material_required_count,
        i
      );
      if (!price) {
        continue;
      }
      parts.push(price);
    }
  }

  const basePrice: PricePart = { label: "Alapár", price: product.price ?? undefined };
  const allParts = [basePrice, ...parts];
  const unitPrice = Math.round(
    allParts.reduce((sum, part) => sum + Math.round(part.price ?? 0), 0)
  );
  const indeterminate = allParts.some((part) => part.price === undefined);
  const discountMultiplier =
    product.discount &&
    product.discount_valid_until &&
    new Date() <= new Date(product.discount_valid_until)
      ? 1 - product.discount / 100
      : undefined;
  const totalPrice =
    unitPrice * product.count * (discountMultiplier === undefined ? 1 : discountMultiplier);

  if (product.length_based_pricing) {
    // FRAGILE: the length source field's string value is reinterpreted as a
    // number (cm). Nothing ties the referenced field to a numeric type, so a
    // non-numeric value silently yields an undefined length. See
    // docs/embroidery-field-plan.md “Field value typing” TODO.
    const lengthSource = product.length_based_pricing.sourceField;
    if (!lengthSource) {
      return {
        priced_by_length: true,
        length: undefined,
        options: parts,
        unitPrice: undefined,
        per_meter_price: unitPrice,
        totalPrice: undefined,
        basePrice,
        indeterminate,
        discount: discountMultiplier,
      };
    }

    const field = product.fields.find((f) => f.name === lengthSource);
    const lengthSourceValue = stringFieldValue(field);
    let length: number | undefined = Number.parseFloat(
      typeof lengthSourceValue === "string" ? lengthSourceValue : ""
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
