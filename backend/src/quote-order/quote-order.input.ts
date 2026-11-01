import { z } from "zod";

export const QuoteOrderProductSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  count: z.number().int().min(1).max(99),
  configText: z.string().max(10_000),
  unitPrice: z.number().int().min(0),
  lineTotal: z.number().int().min(0),
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

export type QuoteOrderInput = z.infer<typeof QuoteOrderSchema>;
export type QuoteOrderProductInput = z.infer<typeof QuoteOrderProductSchema>;

/** Hungarian convention: the surname comes first. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "" };
  }
  return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
}
