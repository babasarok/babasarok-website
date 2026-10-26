/**
 * Order submission: format the order from the product models and POST it to
 * the Vendure shop API, which stores it as a Vendure order and emails the
 * buyer + the shop owner. Kept out of the Svelte component so the form stays
 * declarative. The pricing core stays the price authority (ADR 0002): the
 * computed prices travel with the order and Vendure stores them as-is.
 */
import { calculatePriceForItem } from "@/lib/pricing/price";
import { resolveBasketPricing } from "@/lib/pricing/setDiscount";
import type { SetDiscountGroup, ResolvedSetInstance } from "@/lib/pricing/setDiscount";
import { chargedDeliveryPrice, isDeliveryFree, orderTotal } from "@/lib/order/total";
import type { IProduct, Field } from "../types.svelte";
import type { CmsEnhancedDeliveryMethod, CmsEnhancedEmbroideryColor } from "../data";
import { isFieldVisible } from "../product/field";
import { FIELD_BEHAVIORS } from "../product/behavior";
import { PUBLIC_VENDURE_API_URL } from "astro:env/client";

const VENDURE_API_URL = PUBLIC_VENDURE_API_URL;

export interface OrderDetails {
  name: string;
  email: string;
  phone: string;
  deliveryMethod: CmsEnhancedDeliveryMethod;
  address: string | undefined;
  products: IProduct[];
  threadColors: CmsEnhancedEmbroideryColor[];
  productGroups: SetDiscountGroup[];
  termsAccepted: boolean;
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

/** Render a single product into the plain-text block stored on the order line. */
function formatProductString(
  product: IProduct,
  threadColors: CmsEnhancedEmbroideryColor[]
): string {
  const price = calculatePriceForItem(product);

  // The forint a valid standalone discount removes from the line, so the email
  // records both the percent and the resulting amount without recomputation.
  const undiscounted =
    price.unitPrice === undefined ? undefined : Math.round(price.unitPrice * product.count);
  const standaloneMoney =
    price.discountInfo && undiscounted !== undefined && price.totalPrice !== undefined
      ? undiscounted - price.totalPrice
      : undefined;

  const lines = [
    `${product.title} (${product.count.toString()}db)`,

    ...product.fields
      // Drop fields hidden by an unmet `depends_on` condition — they're not
      // part of the order.
      .filter((f) => isFieldVisible(f, product.fields))
      // Hide only *empty* optional fields; a filled-in optional answer (e.g. a
      // custom note) must still reach the email.
      .filter((f) => FIELD_BEHAVIORS[f.type].includeInEmail(f))
      .map(
        (f) =>
          `${"  ".repeat(fieldIndentDepth(f, product.fields) + 1)}${f.label}: ${FIELD_BEHAVIORS[f.type].formatForEmail(f, { fields: product.fields, threadColors })}`
      ),

    "",
    `Alapár: ${price.basePrice.price?.toString() ?? ""} Ft`,
    ...price.options.map((o) => `${o.label}: ${o.price?.toString() ?? "??"}Ft`),

    "",
    ...(price.unitPrice ? [`  Egységár: ${price.unitPrice.toString()}Ft`] : []),
    ...(price.priced_by_length
      ? [`  Méterár: ${price.per_meter_price?.toString() ?? ""}Ft/m`]
      : []),
    ...(price.discountInfo
      ? [
          `Kedvezmény: ${(price.discountInfo.percent / 100).toLocaleString("hu-HU", {
            style: "percent",
          })}${standaloneMoney === undefined ? "" : ` (-${standaloneMoney.toString()} Ft)`} (${price.discountInfo.discountAppliedCount} db)`,
        ]
      : []),
    `Összár: ${price.totalPrice?.toString() ?? ""}Ft`,
  ];

  return lines.join("\n");
}

/**
 * Basket-level set-discount summary stored with the order: one line per
 * formed instance listing the set, the forint amount it removes, and the
 * member products (each prefixed with its order number, matching the "termek
 * N" blocks) so a discount maps unambiguously to specific items even when
 * titles repeat. Empty when no set discount is earned.
 */
function formatSetDiscounts(instances: ResolvedSetInstance[], products: IProduct[]): string {
  if (instances.length === 0) {
    return "";
  }
  const labelByUuid = new Map(
    products.map((p, i) => [p.uuid, `${(i + 1).toString()}. termék: ${p.title}`])
  );
  const lines = instances.map((instance) => {
    const members = instance.members.map((uuid) => labelByUuid.get(uuid) ?? uuid).join(" + ");
    const { amount, nominal } = instance;
    const clamp = amount < nominal ? ` (szett kedvezmény: ${nominal.toString()} Ft)` : "";
    return `  ${instance.setTitle} szett: -${amount.toString()} Ft${clamp} [${members}]`;
  });
  return ["Szett kedvezmények:", ...lines].join("\n");
}

export interface SubmitOrderOptions {
  /** Buyer's free-text message, stored with the order and shown in the emails. */
  message: string;
  /** Unique per submission attempt; shared with the Google Ads conversion event. */
  transactionId: string;
}

const SUBMIT_MUTATION = `
  mutation SubmitQuoteOrder($input: QuoteOrderInput!) {
    submitQuoteOrder(input: $input) {
      __typename
      ... on SubmitQuoteOrderSuccess {
        orderCode
      }
      ... on SubmitQuoteOrderError {
        errorCode
        message
      }
    }
  }
`;

function buildQuoteOrderInput(
  order: OrderDetails,
  options: SubmitOrderOptions
): Record<string, unknown> {
  // Resolve the basket allocation once; the total and the set summary come
  // from it so the submitted price can't drift from what the buyer saw.
  const pricing = resolveBasketPricing(order.products, order.productGroups);
  // The delivery charged: the method's price, or 0 when the products subtotal
  // (items minus set discounts) is above its free threshold. Judged after the
  // products and set discounts, never on the raw items subtotal.
  const deliveryPrice = chargedDeliveryPrice(order.deliveryMethod, pricing);
  const total = orderTotal(pricing, deliveryPrice);

  return {
    name: order.name,
    email: order.email,
    phone: order.phone,
    products: order.products.map((product) => {
      const price = calculatePriceForItem(product);
      return {
        slug: product.product_id,
        title: product.title,
        count: product.count,
        configText: formatProductString(product, order.threadColors),
        unitPrice: price.unitPrice ?? 0,
        lineTotal: price.totalPrice ?? 0,
      };
    }),
    deliveryMethod: order.deliveryMethod.name,
    deliveryPrice,
    // "ingyenes" only for a positively-priced method charged 0 by its
    // free-delivery threshold; a nominally-free method shows "(0 Ft)".
    deliveryFree: isDeliveryFree(order.deliveryMethod, deliveryPrice),
    needsAddress: order.deliveryMethod.needs_address === true,
    // Sent only for address-requiring methods, matching the old payload.
    address: order.deliveryMethod.needs_address === true ? order.address : undefined,
    message: options.message,
    setDiscountSummary: formatSetDiscounts(pricing.instances, order.products),
    totalPrice: total,
    termsAccepted: order.termsAccepted,
    transactionId: options.transactionId,
  };
}

export type SubmitOrderResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR =
  "Hiba történt az árajánlatkérés elküldése közben. Kérlek, próbáld meg újra később.";

interface SubmitQuoteOrderResponse {
  data?: {
    submitQuoteOrder?:
      | { __typename: "SubmitQuoteOrderSuccess"; orderCode: string }
      | { __typename: "SubmitQuoteOrderError"; errorCode: string; message: string }
      | null;
  };
  errors?: Array<{ message: string }>;
}

export async function submitOrder(
  order: OrderDetails,
  options: SubmitOrderOptions
): Promise<SubmitOrderResult> {
  const input = buildQuoteOrderInput(order, options);

  try {
    const res = await fetch(`${VENDURE_API_URL}/shop-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: SUBMIT_MUTATION,
        variables: { input },
      }),
    });
    const result = (await res.json()) as SubmitQuoteOrderResponse;

    const submitted = result.data?.submitQuoteOrder;
    if (submitted?.__typename === "SubmitQuoteOrderError") {
      return { ok: false, message: `${GENERIC_ERROR} (${submitted.message})` };
    }
    if (submitted?.__typename !== "SubmitQuoteOrderSuccess") {
      console.log("Failed to submit order", result.errors ?? result);
      return { ok: false, message: GENERIC_ERROR };
    }
  } catch (e) {
    console.log("Failed to submit order", e);
    return { ok: false, message: GENERIC_ERROR };
  }

  return { ok: true };
}
