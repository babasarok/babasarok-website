import type { BasketPricing } from "@/lib/pricing/setDiscount";
import type { CmsEnhancedDeliveryMethod } from "../data";

/**
 * The delivery amount the buyer actually pays for a method given the basket's
 * resolved pricing: the method's price, or 0 when the basket's products
 * subtotal (the items subtotal minus the set discounts those items earn —
 * i.e. the order total before delivery) is strictly above the method's
 * `free_above` threshold. The threshold is judged on the discounted subtotal,
 * not the raw items subtotal, so set discounts count towards free delivery.
 */
export function chargedDeliveryPrice(
  method: CmsEnhancedDeliveryMethod,
  pricing: BasketPricing
): number {
  return method.free_above != null && pricing.productsSubtotal > method.free_above
    ? 0
    : method.price;
}

/**
 * Whether a method's charged price means "free" (ingyenes) rather than a 0 Ft
 * price: true only when a positively-priced method is charged at 0 — i.e. the
 * zero came from its `free_above` threshold, not from the method simply
 * costing nothing (a 0 Ft method reports "0 Ft"). Pass the {@link
 * chargedDeliveryPrice} result as `chargedPrice`. Shared by the delivery list,
 * the checkout summary, and the submitted payload so all three report free for
 * exactly the same method and basket state.
 */
export function isDeliveryFree(method: CmsEnhancedDeliveryMethod, chargedPrice: number): boolean {
  return method.price > 0 && chargedPrice === 0;
}

/**
 * The single order total shared by the checkout display and the submitted
 * order: the products subtotal (the items subtotal minus the set discounts
 * those items earn) plus delivery. Both call sites resolve their {@link
 * BasketPricing} once and pass it here, so the price shown always equals the
 * price charged. Delivery is added here rather than inside the pure pricing
 * core, which stays delivery-agnostic (ADR-0002). Pass the {@link
 * chargedDeliveryPrice} result (not the method's nominal price) as
 * `deliveryPrice` so a `free_above` threshold is honoured consistently.
 */
export function orderTotal(pricing: BasketPricing, deliveryPrice: number): number {
  return pricing.productsSubtotal + deliveryPrice;
}
