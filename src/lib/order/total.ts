import type { BasketPricing } from "@/lib/pricing/setDiscount";
import type { CmsEnhancedDeliveryMethod } from "../data";

/**
 * The delivery amount the buyer actually pays for a method given the basket's
 * products subtotal (the items subtotal minus the set discounts those items
 * earn — i.e. the order total before delivery). A method may carry a
 * `free_above` threshold in forint: when the products subtotal is strictly
 * above it, the method is charged at 0. The threshold is judged on the
 * discounted subtotal, not the raw items subtotal, so set discounts count
 * towards the free-delivery threshold.
 */
export function chargedDeliveryPrice(
  method: CmsEnhancedDeliveryMethod,
  productsSubtotal: number
): number {
  return method.free_above != null && productsSubtotal > method.free_above ? 0 : method.price;
}

/**
 * The single order total shared by the checkout display and the submitted
 * order: the items subtotal (standalone discounts already applied) minus the
 * set discounts those items earn, plus delivery. Both call sites resolve their
 * {@link BasketPricing} once and pass it here, so the price shown always equals
 * the price charged. Delivery is added here rather than inside the pure pricing
 * core, which stays delivery-agnostic (ADR-0002). Pass the {@link
 * chargedDeliveryPrice} result (not the method's nominal price) as
 * `deliveryPrice` so a `free_above` threshold is honoured consistently.
 */
export function orderTotal(pricing: BasketPricing, deliveryPrice: number): number {
  return pricing.itemsTotal - pricing.setDiscountTotal + deliveryPrice;
}
