/** Progress-line formatting for the product importer's sync wait. */
export function formatSyncProgress(
  pendingFiles: readonly string[],
  elapsedMs: number,
  synced: number,
  failed: number
): string {
  const minutes = Math.floor(elapsedMs / 60_000);
  const seconds = Math.floor((elapsedMs % 60_000) / 1000);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    `… várakozás: ${pendingFiles.length} függő (${pendingFiles.join(", ")}) — ` +
    `${clock} eltelt, ${synced} szinkronizálva, ${failed} sikertelen`
  );
}
