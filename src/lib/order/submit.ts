/**
 * Order submission: format the order directly from the product models and POST
 * it to web3forms. Kept out of the Svelte component so the form stays declarative.
 */
import { calculatePriceForItem } from "@/lib/pricing/price";
import {
  resolveSetCoverage,
  resolveSetInstances,
  setInstanceAmount,
} from "@/lib/pricing/setDiscount";
import type {
  SetCoverageEntry,
  SetDiscountGroup,
  SetDiscountInstance,
} from "@/lib/pricing/setDiscount";
import type { IProduct, Field, CmsProductMaterial, ProductMaterialValue } from "../types.svelte";
import type { CmsEnhancedDeliveryMethod, CmsEnhancedEmbroideryColor } from "../data";
import { isFieldVisible } from "../pricing/fieldVisibility";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

export interface OrderDetails {
  name: string;
  email: string;
  phone: string;
  deliveryMethod: CmsEnhancedDeliveryMethod;
  address: string | undefined;
  products: IProduct[];
  threadColors: CmsEnhancedEmbroideryColor[];
  productGroups: SetDiscountGroup[];
}

/** Sum of every product's total plus delivery, and whether any price is partial. */
export function calculateOrderTotal(
  products: IProduct[],
  deliveryMethod: CmsEnhancedDeliveryMethod,
  setCoverage: Map<string, SetCoverageEntry[]>
): { total: number; indeterminate: boolean } {
  const prices = products.map((p) => calculatePriceForItem(p, setCoverage.get(p.uuid)));
  return {
    total: prices.reduce((sum, p) => sum + (p.totalPrice ?? 0), 0) + deliveryMethod.price,
    indeterminate: prices.some((p) => p.indeterminate),
  };
}

/** The selected option label/value pair for a field, as shown in the email. */
function formatFieldValue(field: Field, threadColors: CmsEnhancedEmbroideryColor[]): string {
  if (field.type === "toggle") {
    return field.value?.value ? "Igen" : "Nem";
  }
  if (field.type === "embroidery") {
    const color = threadColors.find((c) => c.color_id === field.value?.color.color);
    const colorLabel = field.value?.color.custom_color
      ? `Egyedi szín: ${field.value.color.custom_color}`
      : (color?.label ?? field.value?.color.color ?? "");
    return `${field.value?.text.value ?? ""} (${colorLabel})`;
  }
  if (field.value?.is_custom) {
    return `Egyedi: ${field.value.value}`;
  }
  const label =
    "items" in field
      ? field.items?.find((option) => option?.value === field.value?.value)?.label
      : undefined;
  return label ?? field.value?.value ?? "";
}

/**
 * How deep to indent a field, based on its `depends_on` chain: a field that
 * depends on another sits one level below it, matching the on-screen nesting.
 * Guards against cycles so a malformed chain can't loop forever.
 */
function fieldIndentDepth(field: Field, fields: Field[]): number {
  let depth = 0;
  const seen = new Set<string>();
  let name = field.name;
  let dependency = field.depends_on?.field;
  while (dependency && !seen.has(name)) {
    seen.add(name);
    const parent = fields.find((f) => f.name === dependency);
    if (!parent) {
      break;
    }
    depth++;
    name = parent.name;
    dependency = parent.depends_on?.field;
  }
  return depth;
}

/** The "- material (colors)" line for one chosen material value. */
function formatMaterialLine(
  mv: ProductMaterialValue | undefined,
  materials: CmsProductMaterial[],
  i: number
): string {
  const material = materials.find((m) => m?.material_path.material_id === mv?.material_id);
  const név = material?.material_path.label ?? mv?.material_id ?? "Ismeretlen anyag";
  const color = mv?.custom_color
    ? `Egyedi szín: ${mv.custom_color}`
    : (mv?.colors
        .map((x) => material?.material_path.colors?.find((c) => c.color_id === x)?.label ?? x)
        .join(", ") ?? "");
  return `    ${i + 1}. ${név} (${color})`;
}

/** Render a single product into the plain-text block used in the email body. */
function shouldSubmitField(field: Field): boolean {
  if (field.type === "embroidery") {
    return field.value?.enabled ?? false;
  }
  return !("optional" in field) || !field.optional || !!field.value?.value;
}

function formatProductString(
  product: IProduct,
  threadColors: CmsEnhancedEmbroideryColor[],
  setCoverage?: SetCoverageEntry[]
): string {
  const price = calculatePriceForItem(product, setCoverage);
  const { materials, material_required_count, values } = product.materials;

  // Per-set discount lines so each product block is self-explanatory; the forint
  // amount uses the undiscounted unit price so the total is verifiable.
  const unitPrice = price.unitPrice;
  const setLines =
    unitPrice === undefined
      ? []
      : (setCoverage ?? []).map((entry) => {
          const money = Math.round((unitPrice * entry.percent * entry.count) / 100);
          return `Szett kedvezmény (${entry.setTitle} −${entry.percent.toString()}%): -${money.toString()} Ft (${entry.count.toString()} db)`;
        });

  const lines = [
    `${product.title} (${product.count.toString()}db)`,

    ...product.fields
      // Drop fields hidden by an unmet `depends_on` condition — they're not
      // part of the order.
      .filter((f) => isFieldVisible(f, product.fields))
      // Hide only *empty* optional fields; a filled-in optional answer (e.g. a
      // custom note) must still reach the email.
      .filter(shouldSubmitField)
      .map(
        (f) =>
          `${"  ".repeat(fieldIndentDepth(f, product.fields) + 1)}${f.label}: ${formatFieldValue(f, threadColors)}`
      ),

    ...(materials.length > 0 && material_required_count > 0
      ? ["  Anyagok:", ...values.map((mv, i) => formatMaterialLine(mv, materials, i))]
      : []),

    "",
    `Alapár: ${price.basePrice.price?.toString() ?? ""} Ft`,
    ...price.options.map((o) => `${o.label}: ${o.price?.toString() ?? "??"}Ft`),

    "",
    ...(price.unitPrice ? [`  Egységár: ${price.unitPrice.toString()}Ft`] : []),
    ...(price.priced_by_length
      ? [`  Méterár: ${price.per_meter_price?.toString() ?? ""}Ft/m`]
      : []),
    ...(price.discountInfo && price.discountInfo.discountSource === "standalone"
      ? [
          `Kedvezmény: ${(price.discountInfo.percent / 100).toLocaleString("hu-HU", {
            style: "percent",
          })} (${price.discountInfo.discountAppliedCount} db)`,
        ]
      : []),
    // Per-set discount lines so each product block is self-explanatory; the
    // forint amount uses the undiscounted unit price so the total is verifiable.
    ...setLines,
    `Összár: ${price.totalPrice?.toString() ?? ""}Ft${price.indeterminate ? " (nem teljes ár)" : ""}`,
  ];

  return lines.join("\n");
}

/**
 * Basket-level set-discount summary folded into the `ar` field: one line per
 * formed instance listing the set, its percent, the forint amount it removes,
 * and the member products (each prefixed with its order number, matching the
 * `termek N` blocks) so a discount maps unambiguously to specific items even
 * when titles repeat. Empty when no set discount is earned.
 */
function formatSetDiscounts(instances: SetDiscountInstance[], products: IProduct[]): string {
  if (instances.length === 0) {
    return "";
  }
  const labelByUuid = new Map(
    products.map((p, i) => [p.uuid, `${(i + 1).toString()}. termék: ${p.title}`])
  );
  const lines = instances.map((instance) => {
    const members = instance.members.map((uuid) => labelByUuid.get(uuid) ?? uuid).join(" + ");
    const { amount, indeterminate } = setInstanceAmount(instance, products);
    const suffix = indeterminate ? " (nem teljes ár)" : "";
    return `  ${instance.setTitle} szett (−${instance.percent.toString()}%): -${amount.toString()} Ft${suffix} [${members}]`;
  });
  return ["Szett kedvezmények:", ...lines].join("\n");
}

function buildOrderFormData(order: OrderDetails, accessKey: string, message: string): FormData {
  // Resolve the basket allocation once; both the total and each item's email
  // block price from it so the set status can't be dropped by a single caller.
  const setCoverage = resolveSetCoverage(order.products, order.productGroups);
  const setInstances = resolveSetInstances(order.products, order.productGroups);
  const { total, indeterminate } = calculateOrderTotal(
    order.products,
    order.deliveryMethod,
    setCoverage
  );

  const formData = new FormData();
  formData.append("access_key", accessKey);
  formData.append("subject", `Új árajánlatkérés - ${order.name}`);
  formData.append("nev", order.name);
  formData.append("email", order.email);
  formData.append("telefonszam", order.phone);
  for (const [index, product] of order.products.entries()) {
    formData.append(
      `termek ${(index + 1).toString()}`,
      formatProductString(product, order.threadColors, setCoverage.get(product.uuid))
    );
  }
  formData.append(
    "szallitasimod",
    `${order.deliveryMethod.name} (${order.deliveryMethod.price.toString()} Ft)`
  );
  if (order.deliveryMethod.needs_address) {
    formData.append("szallitasicim", order.address ?? "");
  }
  formData.append("uzenet", message);
  // Set discounts live inside `ar` (not a separate field) so the submitted
  // price and its breakdown stay together and trackable.
  const setSummary = formatSetDiscounts(setInstances, order.products);
  const arLines = [
    `${total.toString()} Ft ${indeterminate ? "(nem teljes ár)" : ""}`.trimEnd(),
    ...(setSummary ? ["", setSummary] : []),
  ];
  formData.append("ar", arLines.join("\n"));
  return formData;
}

export type SubmitOrderResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR =
  "Hiba történt az árajánlatkérés elküldése közben. Kérlek, próbáld meg újra később.";

export async function submitOrder(
  order: OrderDetails,
  options: { accessKey: string; message: string }
): Promise<SubmitOrderResult> {
  const formData = buildOrderFormData(order, options.accessKey, options.message);

  try {
    const res = await fetch(WEB3FORMS_ENDPOINT, { method: "POST", body: formData });
    const result = (await res.json()) as { message?: string } | null;

    if (!res.ok) {
      console.log("Failed to submit order", result);
      return { ok: false, message: `${GENERIC_ERROR} (${result?.message ?? "Ismeretlen hiba"})` };
    }
  } catch (e) {
    console.log("Failed to submit order", e);
    return { ok: false, message: GENERIC_ERROR };
  }

  return { ok: true };
}
