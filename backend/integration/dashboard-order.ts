/**
 * The order as the dashboard's order-detail page reads it from the admin API:
 * the line's variant (id/name/sku) and product name, the stored unit prices,
 * the line custom fields (title/configText/detailsJson and the quoted*
 * snapshots), the totals, the state, the customer, delivery and the order
 * custom fields. Suits the migrations and order-snapshot seams where the
 * criterion is "the order view does not change".
 */
import type { SimpleGraphQLClient } from "@vendure/testing";
import { z } from "zod";
import { run } from "./harness";

export const DashboardOrderSchema = z.object({
  code: z.string(),
  state: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalQuantity: z.number(),
  subTotal: z.number(),
  subTotalWithTax: z.number(),
  shipping: z.number(),
  shippingWithTax: z.number(),
  total: z.number(),
  totalWithTax: z.number(),
  customer: z
    .object({
      emailAddress: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      phoneNumber: z.string().nullable(),
    })
    .nullable(),
  shippingAddress: z.object({
    fullName: z.string().nullable(),
    streetLine1: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    countryCode: z.string().nullable(),
  }),
  shippingLines: z.array(
    z.object({ priceWithTax: z.number(), shippingMethod: z.object({ code: z.string() }) })
  ),
  customFields: z.object({
    message: z.string().nullable(),
    deliveryMethodName: z.string().nullable(),
    deliveryPrice: z.number().nullable(),
    deliveryFree: z.boolean().nullable(),
    orderTotal: z.number().nullable(),
    setDiscountSummary: z.string().nullable(),
    termsAccepted: z.boolean().nullable(),
    submissionTransactionId: z.string().nullable(),
  }),
  lines: z.array(
    z.object({
      id: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      unitPriceWithTax: z.number(),
      linePrice: z.number(),
      linePriceWithTax: z.number(),
      productVariant: z.object({
        id: z.string(),
        name: z.string(),
        sku: z.string(),
        product: z.object({ id: z.string(), name: z.string() }),
      }),
      customFields: z.object({
        title: z.string().nullable(),
        configText: z.string().nullable(),
        detailsJson: z.string().nullable(),
        quotedUnitPrice: z.number().nullable(),
        quotedLineTotal: z.number().nullable(),
        lengthCm: z.number().nullable(),
        selections: z.string().nullable(),
      }),
    })
  ),
});

export type DashboardOrder = z.output<typeof DashboardOrderSchema>;

const ORDER_LIST_QUERY = `
  query {
    orders(options: { take: 100 }) { items {
      code state createdAt updatedAt totalQuantity
      subTotal subTotalWithTax shipping shippingWithTax total totalWithTax
      customer { emailAddress firstName lastName phoneNumber }
      shippingAddress { fullName streetLine1 phoneNumber countryCode }
      shippingLines { priceWithTax shippingMethod { code } }
      customFields {
        message deliveryMethodName deliveryPrice deliveryFree orderTotal
        setDiscountSummary termsAccepted submissionTransactionId
      }
      lines {
        id quantity unitPrice unitPriceWithTax linePrice linePriceWithTax
        productVariant { id name sku product { id name } }
        customFields {
          title configText detailsJson quotedUnitPrice quotedLineTotal
          lengthCm selections
        }
      }
    } }
  }
`;

const OrderListSchema = z.object({
  orders: z.object({ items: z.array(DashboardOrderSchema) }),
});

/** Every order, sorted by code so before/after lists compare positionally. */
export async function dashboardOrders(admin: SimpleGraphQLClient): Promise<DashboardOrder[]> {
  const { orders } = await run(admin, ORDER_LIST_QUERY, {}, OrderListSchema);

  return orders.items.toSorted((a, b) => a.code.localeCompare(b.code));
}
