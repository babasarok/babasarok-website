import { z } from "zod";
import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { SetDiscountSchema, SetStateSchema } from "./setDiscounts";

const InvalidReasonSchema = z.object({ code: z.string(), message: z.string() });

export const OrderLineSchema = z.object({
  id: z.string(),
  quantity: z.number().int(),
  unitPriceWithTax: z.number(),
  discountedLinePriceWithTax: z.number(),
  customFields: z
    .object({ selections: z.string().nullable(), lengthCm: z.number().nullable() })
    .nullable(),
  invalidReason: InvalidReasonSchema.nullable(),
  setState: SetStateSchema.nullable().optional(),
  productVariant: z.object({
    id: z.string(),
    name: z.string(),
    product: z.object({
      slug: z.string(),
      name: z.string(),
      featuredAsset: z.object({ source: z.string() }).nullable(),
      productDefinition: ProductDefinitionSchema.nullable(),
    }),
  }),
});

export const OrderAddressSchema = z.object({
  company: z.string().nullable(),
  streetLine1: z.string().nullable(),
  streetLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  countryCode: z.string().nullable(),
});

export type OrderAddress = z.output<typeof OrderAddressSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  code: z.string(),
  state: z.string(),
  currencyCode: z.string(),
  totalQuantity: z.number().int(),
  subTotalWithTax: z.number(),
  shippingWithTax: z.number(),
  totalWithTax: z.number(),
  discounts: z.array(z.object({ description: z.string(), amountWithTax: z.number() })),
  shippingLines: z.array(
    z.object({
      priceWithTax: z.number(),
      discountedPriceWithTax: z.number(),
      shippingMethod: z.object({ id: z.string() }),
    })
  ),
  customer: z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      emailAddress: z.string(),
      phoneNumber: z.string().nullable(),
    })
    .nullable(),
  shippingAddress: OrderAddressSchema.nullable(),
  billingAddress: OrderAddressSchema.nullable(),
  customFields: z.object({ message: z.string().nullable(), taxNumber: z.string().nullable() }).nullable(),
  lines: z.array(OrderLineSchema),
  setDiscounts: z.array(SetDiscountSchema).optional(),
});

export type Order = z.output<typeof OrderSchema>;
export type OrderLine = z.output<typeof OrderLineSchema>;

export const ShippingQuoteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceWithTax: z.number(),
  customFields: z.object({ requiresAddress: z.boolean() }).nullable(),
});

export type ShippingQuote = z.output<typeof ShippingQuoteSchema>;

export const ProductVariantIdsSchema = z.object({
  product: z.object({ variants: z.array(z.object({ id: z.string() })) }).nullable(),
});
