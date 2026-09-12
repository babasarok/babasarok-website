import type { BasketPricing } from "@/lib/pricing/setDiscount";

/**
 * The single order total shared by the checkout display and the submitted
 * order: the items subtotal (standalone discounts already applied) minus the
 * set discounts those items earn, plus delivery. Both call sites resolve their
 * {@link BasketPricing} once and pass it here, so the price shown always equals
 * the price charged. Delivery is added here rather than inside the pure pricing
 * core, which stays delivery-agnostic (ADR-0002).
 */
export function orderTotal(pricing: BasketPricing, deliveryPrice: number): number {
  return pricing.itemsTotal - pricing.setDiscountTotal + deliveryPrice;
}
