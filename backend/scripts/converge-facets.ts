/**
 * Converges the facets and auto-managed collections for every material, then
 * re-syncs every product referencing a material (facet values on variants).
 * The idempotent convergence path for databases predating the facet sync —
 * production is hand-migrated (ADR 0009), so this runs there once after the
 * catalog import; preview deploys converge through the seeds instead. Safe
 * to re-run at any time.
 *
 * Requires the backend running locally (server AND worker, so the queued
 * product syncs execute) and SUPERADMIN_* in backend/.env.
 *
 * Run: pnpm -C backend run converge-facets
 */
import { z } from "zod";
import { adminRequest, authenticate } from "./lib/admin-client";

const ConvergeDataSchema = z.object({
  convergeMaterialFacets: z.number(),
});

async function main(): Promise<void> {
  await authenticate();
  const result = await adminRequest(
    JSON.stringify({ query: "mutation Converge { convergeMaterialFacets }" })
  );

  if (result.errors.length > 0) {
    throw new Error(`converge failed: ${result.errors.join("; ")}`);
  }

  const converged = ConvergeDataSchema.parse(result.data).convergeMaterialFacets;

  console.log(
    `Facetek/gyűjtemények egyeztetve ${converged} anyagra; a hivatkozó termékek ` +
      "szinkronizálása a job queue-ba állt (worker futtatásával végbemegy)."
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
