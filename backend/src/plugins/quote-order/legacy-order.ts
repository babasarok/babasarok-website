/**
 * Orders from the legacy `submitQuoteOrder` mutation carry their delivery and
 * total as custom fields instead of a shipping line; removed with the
 * mutation at the site cutover (ADR 0013 decision 8).
 */
export function isLegacyQuoteOrder(order: {
  customFields: { deliveryMethodName: string | null };
}): boolean {
  return order.customFields.deliveryMethodName != null;
}
