import type { IProduct, Field, CmsProductMaterial, ProductMaterialValue } from "../types.svelte";
import { isFieldVisible } from "../product/fieldVisibility";
import { findFieldByName, resolveNumericValue } from "../product/fieldValue";
import type { SetCoverageEntry } from "./setDiscount";

interface PricePart {
  label: string;
  price: number | undefined;
}

interface DiscountInfo {
  discount: number;
  discountSource: "set" | "standalone";
  discountAppliedCount: number;
  /** Raw discount percent (e.g. 15 for 15%), independent of the applied count. */
  percent: number;
}

interface BasePrice {
  basePrice: PricePart;
  options: PricePart[];
  unitPrice: number | undefined;
  totalPrice: number | undefined;
  discountInfo: DiscountInfo | undefined;
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

export function calculatePriceForItem(
  product: IProduct,
  setCoverage?: SetCoverageEntry[]
): Price | LengthBasedPrice {
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

  const basePrice: PricePart = { label: "Alapár", price: product.price };
  const allParts = [basePrice, ...parts];
  const unitPrice = Math.round(
    allParts.reduce((sum, part) => sum + Math.round(part.price ?? 0), 0)
  );

  let discount: DiscountInfo | undefined;
  const coveredCount = setCoverage?.reduce((sum, e) => sum + e.count, 0) ?? 0;
  if (setCoverage && coveredCount > 0) {
    // Effective per-line factor: every covered unit gets its set's percent, the
    // rest pay full price. Averaged over the line so length-based pricing and
    // the total both apply one multiplier. Generalises to units split across
    // sets at different percents.
    const percentUnits = setCoverage.reduce((sum, e) => sum + e.percent * e.count, 0);
    discount = {
      discount: 1 - percentUnits / 100 / product.count,
      discountSource: "set",
      discountAppliedCount: coveredCount,
      percent: Math.max(...setCoverage.map((e) => e.percent)),
    };
  } else if (
    product.discount &&
    product.discount_valid_until &&
    new Date() <= new Date(product.discount_valid_until)
  ) {
    discount = {
      discount: 1 - product.discount / 100,
      discountSource: "standalone",
      discountAppliedCount: product.count,
      percent: product.discount,
    };
  }

  const totalPrice = Math.round(
    unitPrice * product.count * (discount === undefined ? 1 : discount.discount)
  );

  if (product.length_based_pricing) {
    // The source field is validated at build time (data.ts) and resolved to a
    // number via the typed accessor; a blank/non-numeric value → no length.
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
        discountInfo: discount,
      };
    }

    const field = findFieldByName(product.fields, lengthSource);
    const cm = resolveNumericValue(field);
    const length = cm === undefined ? undefined : cm / 100;

    return {
      priced_by_length: true,
      length,
      options: parts,
      unitPrice: length === undefined ? undefined : unitPrice * length,
      per_meter_price: unitPrice,
      totalPrice: length === undefined ? undefined : totalPrice * length,
      basePrice,
      discountInfo: discount,
    };
  }

  return {
    options: parts,
    unitPrice,
    totalPrice,
    priced_by_length: false,
    basePrice,
    discountInfo: discount,
  };
}
