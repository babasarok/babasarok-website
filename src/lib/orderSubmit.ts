/**
 * Order submission: format the order directly from the product models and POST
 * it to web3forms. Kept out of the Svelte component so the form stays declarative.
 */
import { calculatePriceForItem } from "@/lib/priceUtils";
import type { IProduct } from "./types.svelte";
import type { CmsDeliveryMethod } from "./data";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

export interface OrderDetails {
  name: string;
  email: string;
  phone: string;
  deliveryMethod: CmsDeliveryMethod;
  products: IProduct[];
}

/** Sum of every product's total plus delivery, and whether any price is partial. */
export function calculateOrderTotal(
  products: IProduct[],
  deliveryMethod: CmsDeliveryMethod
): { total: number; indeterminate: boolean } {
  const prices = products.map((p) => calculatePriceForItem(p));
  return {
    total: prices.reduce((sum, p) => sum + (p.totalPrice ?? 0), 0) + deliveryMethod.price,
    indeterminate: prices.some((p) => p.indeterminate),
  };
}

/** Render a single product into the plain-text block used in the email body. */
function formatProductString(product: IProduct): string {
  const price = calculatePriceForItem(product);

  let result = product.title;
  result += ` (${product.count.toString()}db)`;
  result += `\n`;

  const options = product.fields.filter((f) => !("optional" in f) || !f.optional);
  for (const field of options) {
    const label =
      "items" in field
        ? field.items?.find((option) => option?.value === field.value?.value)?.label
        : undefined;
    result += `  ${field.label}: ${label ?? field.value?.value ?? ""}\n`;
  }

  if (product.materials.materials.length > 0 && product.materials.material_required_count > 0) {
    result += `  Anyagok:\n`;
    for (const mv of product.materials.values) {
      const material = product.materials.materials.find(
        (m) => m?.material_path.material_id === mv?.material_id
      );
      const név = material?.material_path.label ?? mv?.material_id ?? "Ismeretlen anyag";
      const color = mv?.custom_color
        ? `Egyedi szín: ${mv.custom_color}`
        : (mv?.colors
            .map((x) => material?.material_path.colors?.find((c) => c?.color_id === x)?.label ?? x)
            .join(", ") ?? "");
      result += `    - ${név} (${color})\n`;
    }
  }

  result += "\n";
  result += `Alapár: ${price.basePrice.price?.toString() ?? ""} Ft\n`;
  for (const option of price.options) {
    result += `${option.label}: ${option.price?.toString() ?? "??"}Ft \n`;
  }
  result += "\n";
  result += `${price.unitPrice ? `  Egységár: ${price.unitPrice.toString()}Ft` : ""}\n`;
  if (price.priced_by_length) {
    result += `  Méterár: ${price.per_meter_price?.toString() ?? ""}Ft/m\n`;
  }
  result += `Összár: ${price.totalPrice?.toString() ?? ""}Ft ${price.indeterminate ? "(nem teljes ár)" : ""}`;

  return result;
}

function buildOrderFormData(order: OrderDetails, accessKey: string, message: string): FormData {
  const { total, indeterminate } = calculateOrderTotal(order.products, order.deliveryMethod);

  const formData = new FormData();
  formData.append("access_key", accessKey);
  formData.append("subject", `Új árajánlatkérés - ${order.name}`);
  formData.append("nev", order.name);
  formData.append("email", order.email);
  formData.append("telefonszam", order.phone);
  for (const [index, product] of order.products.entries()) {
    formData.append(`termek ${(index + 1).toString()}`, formatProductString(product));
  }
  formData.append(
    "szallitasimod",
    `${order.deliveryMethod.name} (${order.deliveryMethod.price.toString()} Ft)`
  );
  formData.append("uzenet", message);
  formData.append("ar", `${total.toString()} Ft ${indeterminate ? "(nem teljes ár)" : ""}`);
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
