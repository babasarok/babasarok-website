import z from "zod";

export const deliveryMethodValidator = z.object({
    delivery_name: z.string(),
    name: z.string(),
    price: z.number(),
});

export type TinaDeliveryMethod = z.infer<typeof deliveryMethodValidator>;
