import { z } from "zod";

export const QuoteOrderDetailSchema = z.object({
  label: z.string().max(300),
  value: z.string().max(2000),
  depth: z.number().int().min(0).max(10),
});

export const QuoteOrderProductSchema = z
  .object({
    slug: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
    count: z.number().int().min(1).max(99),
    configText: z.string().max(10_000).optional(),
    details: z.array(QuoteOrderDetailSchema).max(100).optional(),
    unitPrice: z.number().int().min(0),
    lineTotal: z.number().int().min(0),
  })
  .refine((product) => product.configText !== undefined || product.details !== undefined, {
    path: ["details"],
    message: "A product needs details or configText (a termékhez részletek szükségesek)",
  });

export const QuoteOrderSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.email().max(320),
    phone: z.string().max(30).optional(),
    products: z.array(QuoteOrderProductSchema).min(1).max(50),
    deliveryMethod: z.string().min(1).max(300),
    deliveryPrice: z.number().int().min(0),
    deliveryFree: z.boolean(),
    needsAddress: z.boolean(),
    address: z.string().max(1000).optional(),
    message: z.string().max(5000).optional(),
    setDiscountSummary: z.string().max(5000).optional(),
    totalPrice: z.number().int().min(0),
    termsAccepted: z.literal(true),
    transactionId: z.string().min(8).max(64),
  })
  .superRefine((value, ctx) => {
    if (value.needsAddress && !value.address) {
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: "Address is required for the selected delivery method",
      });
    }
  });

/** Reads the stored details; undefined for lines submitted without them. */
export function parseProductDetails(
  json: string | null | undefined
): Array<z.infer<typeof QuoteOrderDetailSchema>> | undefined {
  if (!json) {
    return;
  }

  const result = z.array(QuoteOrderDetailSchema).safeParse(JSON.parse(json));

  if (!result.success) {
    return;
  }

  return result.data;
}

export type QuoteOrderInput = z.infer<typeof QuoteOrderSchema>;
export type QuoteOrderProductInput = z.infer<typeof QuoteOrderProductSchema>;

/** Hungarian convention: the surname comes first. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return { lastName: parts[0], firstName: parts.slice(1).join(" ") };
}
