import { z } from "zod";

export const SyncProgressSchema = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type SyncProgress = z.infer<typeof SyncProgressSchema>;

const ProgressCarrierSchema = z.object({ progress: SyncProgressSchema });

/** The progress a running job's data carries, or null when it has reported none yet. */
export function progressOfJobData(data: unknown): SyncProgress | null {
  const parsed = ProgressCarrierSchema.safeParse(data);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.progress;
}

/** Counts finished work units out of a fixed total and reports each new count. */
export function createProgressCounter(
  total: number,
  report: (progress: SyncProgress) => void
): { advance: (units: number) => void } {
  let done = 0;

  report({ done, total });

  return {
    advance(units: number): void {
      done = Math.min(total, done + units);
      report({ done, total });
    },
  };
}
