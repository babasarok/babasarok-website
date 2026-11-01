/**
 * One-way seed: Tina product content → Vendure (ADR 0009, preview-only).
 * Reads src/content/product/*.md, parses the frontmatter into the canonical
 * ProductDefinition (scripts/lib/tina-source.ts — Tina is a read-only
 * test-data source until cutover), then upserts each definition and syncs the
 * native option groups/variants. Re-runnable (upsert by product id); native
 * drift is reported and overwritten, since the seed re-establishes known test
 * state. Definitions also enter through the admin API's
 * createProductDefinition/updateProductDefinition mutations, which validate
 * against the canonical schema — invalid content is skipped and listed, same
 * as the material seed.
 *
 * TEMPORARY and preview-only: production is seeded once by a hand-migration
 * directly from the repo at cutover, never by this script.
 *
 * Run: pnpm -C backend run import-products
 * (requires the backend running locally and SUPERADMIN_* in backend/.env)
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ProductDefinitionSchema } from "@babasarok/product-definition";
import { parse } from "yaml";
import {
  definitionFromTinaProduct,
  productRevision,
  TinaProductSchema,
  type TinaProduct,
} from "./lib/tina-source";
/** The definition shape sent to the admin API (server-side zod validates it). */
type DefinitionPayload = z.input<typeof ProductDefinitionSchema>;

const API_URL = `http://localhost:${process.env.PORT ?? "4000"}/admin-api`;
const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "content", "product");

interface UpsertResult {
  kind: "created" | "updated";
}

interface AdminResult {
  data: unknown;
  errors: string[];
}

const DefinitionsDataSchema = z.object({
  productDefinitions: z.array(z.object({ productId: z.string() })).default([]),
});

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

  if (authToken === null) {
    throw new Error(`login failed: ${result.errors.join("; ") || "unknown error"}`);
  }
}

function parseFrontmatter(
  raw: string
): { success: true; product: TinaProduct } | { success: false; error: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);

  if (match === null) {
    return { success: false, error: "no frontmatter found" };
  }

  const result = TinaProductSchema.safeParse(parse(match[1]));

  if (!result.success) {
    return {
      success: false,
      error:
        "invalid frontmatter — " +
        result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    };
  }

  return { success: true, product: result.data };
}

async function upsert(definition: DefinitionPayload): Promise<UpsertResult | string> {
  const existing = DefinitionsDataSchema.parse(
    (await adminRequest(JSON.stringify({ query: `{ productDefinitions { productId } }` }))).data
  );
  const isExisting = existing.productDefinitions.some((row) => row.productId === definition.id);

  if (!isExisting) {
    const result = await adminRequest(
      JSON.stringify({
        query: `mutation Create($definition: JSON!) { createProductDefinition(definition: $definition) { productId } }`,
        variables: { definition },
      })
    );

    return result.errors.length === 0 ? { kind: "created" } : result.errors.join("; ");
  }

  const update = `mutation Update($productId: String!, $definition: JSON!, $force: Boolean) { updateProductDefinition(productId: $productId, definition: $definition, force: $force) { productId } }`;
  let result = await adminRequest(
    JSON.stringify({
      query: update,
      variables: { productId: definition.id, definition, force: false },
    })
  );

  const drifted = result.errors.some((message) => message.includes("natív adatai"));

  if (drifted) {
    console.warn(`! ${definition.id}: natív módosítás felülírása a szinkronizálással (force).`);
    result = await adminRequest(
      JSON.stringify({
        query: update,
        variables: { productId: definition.id, definition, force: true },
      })
    );
  }

  return result.errors.length === 0 ? { kind: "updated" } : result.errors.join("; ");
}

async function main(): Promise<void> {
  const files = (await readdir(CONTENT_DIR)).filter((file) => file.endsWith(".md"));
  await authenticate();

  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const frontmatter = parseFrontmatter(raw);

    if (!frontmatter.success) {
      skipped += 1;
      console.error(`✗ ${file}: ${frontmatter.error}`);
      continue;
    }

    const definition = definitionFromTinaProduct(frontmatter.product);

    if (!definition.success) {
      skipped += 1;
      console.error(`✗ ${file}: ${definition.errors.join("; ")}`);
      continue;
    }

    const final: DefinitionPayload = {
      ...definition.definition,
      revision: productRevision(definition.definition),
    };
    const outcome = await upsert(final);

    if (typeof outcome === "string") {
      failed += 1;
      console.error(`✗ ${file}: ${outcome}`);
      continue;
    }

    if (outcome.kind === "created") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    `products: ${created} created, ${updated} updated, ` +
      `${failed} failed, ${skipped} skipped by schema`
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
