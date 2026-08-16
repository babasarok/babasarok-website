import type { IProduct, Field, CmsProductMaterial } from "./types.svelte";
import type { ProductMaterialValue } from "./types.svelte";
import { isFieldVisible } from "./fieldVisibility";
import { findFieldByName, resolveNumericValue } from "./fieldValue";

interface PricePart {
  label: string;
  price: number | undefined;
}

interface DiscountInfo {
  discount: number;
  discountSource: "set" | "standalone";
  discountAppliedCount: number;
}

interface BasePrice {
  basePrice: PricePart;
  options: PricePart[];
  unitPrice: number | undefined;
  totalPrice: number | undefined;
  indeterminate: boolean;
  discountInfo: DiscountInfo | undefined;
}

/** Minimal structural shape of a product group, to avoid a data.ts import cycle. */
export interface SetDiscountGroup {
  title: string;
  products: { product_id: string; discount_percent?: number | undefined }[];
}

/**
 * The best set discount a product qualifies for: the largest `discount_percent`
 * across every group membership. When a product is in more than one set, the
 * biggest discount wins (no stacking). See docs/set-pricing-model.md.
 */
export function resolveSetDiscount(
  productId: string,
  groups: SetDiscountGroup[]
): { percent: number; setTitle: string } | undefined {
  let best: { percent: number; setTitle: string } | undefined;
  for (const group of groups) {
    for (const member of group.products) {
      if (member.product_id !== productId || member.discount_percent == null) {
        continue;
      }
      if (!best || member.discount_percent > best.percent) {
        best = { percent: member.discount_percent, setTitle: group.title };
      }
    }
  }
  return best;
}

/** Normalised, order-independent view of a product's selected material values. */
function normalizeMaterialValues(product: IProduct): string {
  const values = product.materials.values
    .filter((v): v is ProductMaterialValue => v != null && v.material_id !== "")
    .map((v) => ({
      material_id: v.material_id,
      colors: v.colors.toSorted(),
      custom_color: v.custom_color ?? "",
    }))
    .toSorted((a, b) => a.material_id.localeCompare(b.material_id));
  return JSON.stringify(values);
}

/**
 * Two products count towards the same set only when their selected material
 * values match exactly (same materials, colours and custom colours). The
 * comparison is order-independent and ignores transient `error` fields. Two
 * products with no material selections match trivially. See
 * docs/set-pricing-model.md.
 */
export function materialsMatch(a: IProduct, b: IProduct): boolean {
  return normalizeMaterialValues(a) === normalizeMaterialValues(b);
}

/**
 * The set discount an item actively earns given the current basket. An item
 * only earns a set's discount when at least one *other* basket item is also a
 * member of that set and has exactly matching material values. When several
 * sets qualify, the biggest discount wins (no stacking).
 */
export function resolveActiveSetDiscount(
  item: IProduct,
  basket: IProduct[],
  groups: SetDiscountGroup[]
): ActiveDiscountStatus | undefined {
  let best: ActiveDiscountStatus | undefined;
  for (const group of groups) {
    const membership = group.products.find(
      (m) => m.product_id === item.product_id && m.discount_percent != null
    );

    if (!membership || membership.discount_percent == null) {
      continue;
    }

    const memberIds = new Set(group.products.map((m) => m.product_id));

    const matchingPartners = basket.filter(
      (other) =>
        other.uuid !== item.uuid && memberIds.has(other.product_id) && materialsMatch(item, other)
    );
    const hasMatchingPartner = matchingPartners.length > 0;

    if (hasMatchingPartner && (!best || membership.discount_percent > best.percent)) {
      best = {
        state: "active",
        percent: membership.discount_percent,
        setTitle: group.title,
        count: Math.min(...matchingPartners.map((x) => x.count), item.count),
      };
    }
  }
  return best;
}

export type ActiveDiscountStatus = {
  state: "active";
  percent: number;
  setTitle: string;
  count: number;
};
/**
 * The state of an item's best set discount relative to the current basket, for
 * surfacing in the UI: `active` when earned, `pending-partner` when no set
 * sibling is in the basket yet, `pending-material` when a sibling is present but
 * its materials differ (with `canSync` when a one-click material match is
 * possible). An active discount always wins; otherwise the biggest potential
 * discount is reported. `undefined` when the item earns no set discount at all.
 */
export type SetDiscountStatus =
  | ActiveDiscountStatus
  | { state: "pending-partner"; percent: number; setTitle: string; count: number }
  | {
      state: "pending-material";
      percent: number;
      setTitle: string;
      partnerUuid: string;
      canSync: boolean;
      count: number;
    };

/**
 * Whether copying `partner`'s selected materials onto `item` could produce a
 * matching selection: the two must need the same number of materials and every
 * material `partner` picked must be available on `item`. Used to decide whether
 * to offer a one-click "match materials" action.
 */
export function canSyncMaterials(item: IProduct, partner: IProduct): boolean {
  if (item.materials.material_required_count !== partner.materials.material_required_count) {
    return false;
  }
  const available = new Set(
    item.materials.materials
      .map((m) => m?.material_path.material_id)
      .filter((id): id is string => id != null)
  );
  return partner.materials.values.every(
    (v) => v == null || v.material_id === "" || available.has(v.material_id)
  );
}

export function resolveSetDiscountStatus(
  item: IProduct,
  basket: IProduct[],
  groups: SetDiscountGroup[]
): SetDiscountStatus | undefined {
  const memberships = groups
    .map((group) => {
      const membership = group.products.find(
        (m) => m.product_id === item.product_id && m.discount_percent != null
      );
      return membership?.discount_percent == null
        ? undefined
        : {
            percent: membership.discount_percent,
            setTitle: group.title,
            memberIds: new Set(group.products.map((m) => m.product_id)),
          };
    })
    .filter((m): m is NonNullable<typeof m> => m != null);

  if (memberships.length === 0) {
    return undefined;
  }

  const partnersIn = (memberIds: Set<string>): IProduct[] =>
    basket.filter((other) => other.uuid !== item.uuid && memberIds.has(other.product_id));

  let active: { percent: number; setTitle: string; count: number } | undefined;
  for (const m of memberships) {
    // Count the discount only over matching-material partners so it agrees with
    // `resolveActiveSetDiscount` (the resolver used for actual pricing).
    const matching = partnersIn(m.memberIds).filter((other) => materialsMatch(item, other));
    if (matching.length > 0 && (!active || m.percent > active.percent)) {
      active = {
        percent: m.percent,
        setTitle: m.setTitle,
        count: Math.min(...matching.map((x) => x.count), item.count),
      };
    }
  }
  if (active) {
    return { state: "active", ...active };
  }

  let pending: SetDiscountStatus | undefined;
  for (const m of memberships) {
    const partners = partnersIn(m.memberIds);
    let candidate: SetDiscountStatus;
    if (partners.length > 0) {
      const partner = partners.find((other) => canSyncMaterials(item, other)) ?? partners[0];
      candidate = {
        state: "pending-material",
        percent: m.percent,
        setTitle: m.setTitle,
        partnerUuid: partner.uuid,
        canSync: canSyncMaterials(item, partner),
        count: Math.min(...partners.map((x) => x.count), item.count),
      };
    } else {
      candidate = {
        state: "pending-partner",
        percent: m.percent,
        setTitle: m.setTitle,
        count: item.count,
      };
    }
    if (!pending || candidate.percent > pending.percent) {
      pending = candidate;
    }
  }
  return pending;
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
  setStatus: ActiveDiscountStatus | undefined
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
  const indeterminate = allParts.some((part) => part.price === undefined);

  let discount: DiscountInfo | undefined;
  if (setStatus?.percent != null && setStatus.percent > 0) {
    discount = {
      discount: 1 - (setStatus.percent * (setStatus.count / product.count)) / 100,
      discountSource: "set",
      discountAppliedCount: setStatus.count,
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
    };
  }

  const totalPrice = unitPrice * product.count * (discount === undefined ? 1 : discount.discount);

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
        indeterminate,
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
      indeterminate,
      discountInfo: discount,
    };
  }

  return {
    options: parts,
    unitPrice,
    totalPrice,
    priced_by_length: false,
    basePrice,
    indeterminate,
    discountInfo: discount,
  };
}
