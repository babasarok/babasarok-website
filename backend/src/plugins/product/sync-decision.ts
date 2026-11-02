import { z } from "zod";

export const SyncJobDataSchema = z.object({
  productId: z.string(),
  origin: z.enum(["owner-save", "automatic"]).default("automatic"),
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

export type AutomaticSyncDecision = "skip" | "drift" | "write";

/**
 * What an automatic (event-triggered) sync does: nothing when the native
 * product already matches the plan, nothing but a drift flag when it was
 * edited outside the sync, otherwise the write.
 */
export function automaticSyncDecision(hashes: {
  planned: string;
  current: string;
  synced: string | null;
}): AutomaticSyncDecision {
  if (hashes.planned === hashes.current) {
    return "skip";
  }

  if (hashes.synced !== null && hashes.synced !== hashes.current) {
    return "drift";
  }

  return "write";
}
