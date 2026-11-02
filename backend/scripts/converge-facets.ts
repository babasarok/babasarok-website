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

const API_URL = `http://localhost:${process.env.PORT ?? "4000"}/admin-api`;

const AuthenticateDataSchema = z.object({
  authenticate: z.object({ message: z.string().optional() }).optional(),
});

const ConvergeDataSchema = z.object({
  convergeMaterialFacets: z.number(),
});

interface AdminResult {
  data: unknown;
  errors: string[];
}

let authToken: string | null = null;

async function adminRequest(body: string): Promise<AdminResult> {
  const headers: Record<string, string> = {
    "Apollo-Require-Preflight": "true",
    "Content-Type": "application/json",
  };

  if (authToken !== null) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(API_URL, { method: "POST", headers, body });
  const tokenHeader = response.headers.get("vendure-auth-token");

  if (tokenHeader !== null) {
    authToken = tokenHeader;
  }

  const result = z
    .object({
      data: z.unknown().optional(),
      errors: z.array(z.object({ message: z.string() })).optional(),
    })
    .parse(await response.json());

  return { data: result.data, errors: result.errors?.map((error) => error.message) ?? [] };
}

async function authenticate(): Promise<void> {
  // ponytail: the fallbacks duplicate vendure-config's superadmin defaults;
  // sharing them needs an import of ../src/env, which node's type stripping
  // only resolves with a .ts extension that tsc's emit rules reject.
  const email = process.env.SUPERADMIN_EMAIL ?? "admin@babasarok.local";
  const password = process.env.SUPERADMIN_PASSWORD ?? "superadmin";
  const result = await adminRequest(
    JSON.stringify({
      query: `mutation Login($username: String!, $password: String!) {
        authenticate(input: { native: { username: $username, password: $password } }) {
          ... on CurrentUser { id }
          ... on ErrorResult { errorCode message }
        }
      }`,
      variables: { username: email, password },
    })
  );
  const parsed = AuthenticateDataSchema.safeParse(result.data);
  const message = parsed.success ? parsed.data.authenticate?.message : undefined;

  if (authToken === null) {
    throw new Error(`login failed: ${message ?? JSON.stringify(result.errors)}`);
  }
}

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
