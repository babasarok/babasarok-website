import { z } from "zod";

const API_URL = `http://localhost:${process.env.PORT ?? "4000"}/admin-api`;

let authToken: string | null = null;

export async function adminRequest(body: string): Promise<{ data: unknown; errors: string[] }> {
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

export async function authenticate(): Promise<void> {
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

  if (authToken === null) {
    throw new Error(`login failed: ${result.errors.join("; ") || "unknown error"}`);
  }
}
