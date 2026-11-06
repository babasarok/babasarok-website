/**
 * Orders placed by the removed legacy `submitQuoteOrder` mutation (ADR 0013
 * decision 8) carry their delivery and total as custom fields instead of a
 * shipping line.
 */
export function isLegacyQuoteOrder(order: {
  customFields: { deliveryMethodName: string | null };
}): boolean {
  return order.customFields.deliveryMethodName != null;
}
