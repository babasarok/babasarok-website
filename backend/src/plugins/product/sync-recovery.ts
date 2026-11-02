import { SyncJobDataSchema } from "./sync-decision";

/** Pending definitions that no queued sync job will pick up. */
export function definitionsToRequeue(
  pendingProductIds: string[],
  queuedJobData: unknown[]
): string[] {
  const queued = new Set<string>();

  for (const data of queuedJobData) {
    const parsed = SyncJobDataSchema.safeParse(data);

    if (parsed.success) {
      queued.add(parsed.data.productId);
    }
  }

  return pendingProductIds.filter((productId) => !queued.has(productId));
}
