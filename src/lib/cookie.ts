import z from "astro/zod";

export const cookieSchema = z.object({
  name: z.string(),
  domain: z.string(),
  lifetime: z.string(),
});

export const cookieCategorySchema = z.object({
  key: z.enum(["necessary", "analytics", "marketing"]),
  label: z.string(),
  description: z.string(),
  locked: z.boolean(),
  cookies: z.array(cookieSchema),
});

export type Cookie = z.infer<typeof cookieSchema>;
export type CookieCategory = z.infer<typeof cookieCategorySchema>;
