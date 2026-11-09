import { z } from "zod";

export const SyncJobDataSchema = z.object({
  productId: z.string(),
  origin: z.enum(["owner-save", "automatic"]).default("automatic"),
  /** The acting admin captured at enqueue time; null for system-triggered syncs. */
  actor: z.object({ id: z.number(), identifier: z.string() }).nullable().default(null),
});

export type SyncJobData = z.infer<typeof SyncJobDataSchema>;

const ProductUpdateNamesSchema = z.object({
  translations: z.array(z.object({ name: z.string().nullish() })),
});

/** True when a stock product update input carries a name for any language. */
export function updateInputCarriesName(input: unknown): boolean {
  const parsed = ProductUpdateNamesSchema.safeParse(input);

  if (!parsed.success) {
    return false;
  }

  return parsed.data.translations.some((translation) => translation.name != null);
}
