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
 * (requires the backend running locally and SUPERADMIN_* in backend/.env;
 * overall budget IMPORT_PRODUCTS_SYNC_BUDGET_MINUTES minutes, default 45)
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ProductDefinitionSchema } from "@babasarok/product-definition";
import { ProductGroupDefinitionSchema } from "@babasarok/product-definition";
import { z } from "zod";
import { parse } from "yaml";
import {
  definitionFromTinaProduct,
  groupDefinitionFromTinaProductGroup,
  TinaProductGroupSchema,
  TinaProductSchema,
} from "./lib/tina-source.ts";
/** The definition shape sent to the admin API (server-side zod validates it). */
type DefinitionPayload = z.input<typeof ProductDefinitionSchema>;

const API_URL = `http://localhost:${process.env.PORT ?? "4000"}/admin-api`;
const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "content", "product");
const GROUPS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "content",
  "product_groups"
);
// Undici's own headersTimeout is 300s; ours must fire first to fail with a
// clear message instead of UND_ERR_HEADERS_TIMEOUT.
const REQUEST_TIMEOUT_MS = 240_000;
const RUN_BUDGET_MS = (Number(process.env.IMPORT_PRODUCTS_SYNC_BUDGET_MINUTES) || 45) * 60_000;

interface UpsertResult {
  kind: "created" | "updated";
}

/** A definition whose queued sync the run still waits for. */
interface SyncTarget {
  file: string;
  productId: string;
  startedAt: number;
}

interface AdminResult {
  data: unknown;
  errors: string[];
  codes: string[];
}

const DefinitionsDataSchema = z.object({
  productDefinitions: z
    .object({
      totalItems: z.number(),
      items: z.array(z.object({ productId: z.string() })).default([]),
    })
    .default({ totalItems: 0, items: [] }),
});

const SyncStatesSchema = z.object({
  productDefinitions: z
    .object({
      items: z
        .array(
          z.object({
            productId: z.string(),
            syncState: z.string(),
            syncError: z.string().nullish(),
          })
        )
        .default([]),
    })
    .default({ items: [] }),
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

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const tokenHeader = response.headers.get("vendure-auth-token");

  if (tokenHeader !== null) {
    authToken = tokenHeader;
  }

  const result = z
    .object({
      data: z.unknown().optional(),
      errors: z
        .array(
          z.object({ message: z.string(), extensions: z.object({ code: z.string() }).optional() })
        )
        .optional(),
    })
    .parse(await response.json());

  return {
    data: result.data,
    errors: result.errors?.map((error) => error.message) ?? [],
    codes: result.errors?.map((error) => error.extensions?.code ?? "") ?? [],
  };
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

function parseFrontmatter<T extends z.ZodType>(
  raw: string,
  schema: T
): { success: true; data: z.output<T> } | { success: false; error: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);

  if (match === null) {
    return { success: false, error: "no frontmatter found" };
  }

  const result = schema.safeParse(parse(match[1]));

  if (!result.success) {
    return {
      success: false,
      error:
        "invalid frontmatter — " +
        result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    };
  }

  return { success: true, data: result.data };
}

async function upsert(definition: DefinitionPayload): Promise<UpsertResult | string> {
  const existing = DefinitionsDataSchema.parse(
    (
      await adminRequest(
        JSON.stringify({
          query: `{ productDefinitions(options: { skip: 0, take: 100 }) { totalItems items { productId } } }`,
        })
      )
    ).data
  );
  const isExisting = existing.productDefinitions.items.some(
    (row) => row.productId === definition.id
  );

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

  const drifted = result.codes.includes("PRODUCT_DEFINITION_NATIVE_DRIFT");

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
  const startedAt = Date.now();

  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const syncTargets: SyncTarget[] = [];
  const productIdByFile = new Map<string, string>();

  for (const file of files) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      throw new Error(
        `futási időkeret túllépve (${Math.round(RUN_BUDGET_MS / 60_000)} perc) — ${file} lesz a következő`
      );
    }

    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const frontmatter = parseFrontmatter(raw, TinaProductSchema);

    if (!frontmatter.success) {
      skipped += 1;
      console.error(`✗ ${file}: ${frontmatter.error}`);
      continue;
    }

    productIdByFile.set(file.replace(/\.md$/, ""), frontmatter.data.product_id.trim());
    const definition = definitionFromTinaProduct(frontmatter.data);

    if (!definition.success) {
      skipped += 1;
      console.error(`✗ ${file}: ${definition.errors.join("; ")}`);
      continue;
    }

    // The revision is the server's determination; the seed sends none.
    const final: DefinitionPayload = definition.definition;
    console.log(`→ ${file}`);
    const fileStartedAt = Date.now();

    let outcome: UpsertResult | string;

    try {
      outcome = await upsert(final);
    } catch (error: unknown) {
      failed += 1;
      console.error(
        `✗ ${file}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`
      );
      continue;
    }

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

    console.log(
      `✓ ${file}: ${outcome.kind} (${((Date.now() - fileStartedAt) / 1000).toFixed(1)}s)`
    );
    syncTargets.push({ file, productId: final.id, startedAt: fileStartedAt });
  }

  const syncs = await waitForSyncs(syncTargets, startedAt);
  const groups = await reportGroups(productIdByFile);

  console.log(
    `products: ${created} created, ${updated} updated, ` +
      `${failed} failed, ${skipped} skipped by schema | ` +
      `syncs: ${syncs.synced} synced, ${syncs.failed.length} failed | ` +
      `groups: ${groups.validated} validated, ${groups.failed} failed`
  );

  if (failed > 0 || syncs.failed.length > 0) {
    process.exitCode = 1;
  }
}

/**
 * ponytail: parse-and-validate only — groups have no Vendure entity yet (their
 * membership model is sequenced with the promotions step), so the seed reports
 * what it would import instead of inventing a half-entity.
 */
async function reportGroups(
  productIdByFile: ReadonlyMap<string, string>
): Promise<{ validated: number; failed: number }> {
  const files = (await readdir(GROUPS_DIR)).filter((file) => file.endsWith(".md"));
  let validated = 0;
  let failed = 0;

  for (const file of files) {
    const raw = await readFile(path.join(GROUPS_DIR, file), "utf8");
    const frontmatter = parseFrontmatter(raw, TinaProductGroupSchema);

    if (!frontmatter.success) {
      failed += 1;
      console.error(`✗ ${file}: ${frontmatter.error}`);
      continue;
    }

    const id = file.replace(/\.md$/, "");
    const group = groupDefinitionFromTinaProductGroup(frontmatter.data, id, productIdByFile);

    if (!group.success) {
      failed += 1;
      console.error(`✗ ${file}: ${group.errors.join("; ")}`);
      continue;
    }

    const result = ProductGroupDefinitionSchema.safeParse(group.group);

    if (!result.success) {
      failed += 1;
      console.error(
        `✗ ${file}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
      );
      continue;
    }

    validated += 1;
    const definition = result.data;

    if (definition.kind === "discounted-set") {
      console.log(
        `✓ ${file}: szett "${definition.label}" — ${definition.productIds.length} termék, kedvezmény ${definition.discount} Ft`
      );
    } else {
      console.log(
        `✓ ${file}: kapcsolódó termékek "${definition.label}" — ${definition.productIds.length} termék`
      );
    }
  }

  return { validated, failed };
}

/** Waits for the queued syncs to settle (the worker processes them serially). */
async function waitForSyncs(
  targets: SyncTarget[],
  startedAt: number
): Promise<{ synced: number; failed: string[] }> {
  const pending = new Map(targets.map((target) => [target.productId, target]));
  let synced = 0;
  const failed: string[] = [];

  while (pending.size > 0) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      for (const target of pending.values()) {
        console.error(`✗ ${target.file}: szinkronizálási időkeret túllépés`);
        failed.push(target.file);
      }

      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const states = SyncStatesSchema.parse(
      (
        await adminRequest(
          JSON.stringify({
            query: `{ productDefinitions(options: { skip: 0, take: 100 }) { items { productId syncState syncError } } }`,
          })
        )
      ).data
    );

    for (const row of states.productDefinitions.items) {
      const target = pending.get(row.productId);

      if (target === undefined) {
        continue;
      }

      const waited = ((Date.now() - target.startedAt) / 1000).toFixed(1);

      if (row.syncState === "synced") {
        pending.delete(row.productId);
        synced += 1;
        console.log(`✓ ${target.file}: szinkronizálva (${waited}s)`);
      } else if (row.syncState === "failed") {
        pending.delete(row.productId);
        failed.push(target.file);
        console.error(`✗ ${target.file}: szinkronizálás sikertelen — ${row.syncError ?? ""}`);
      }
    }
  }

  return { synced, failed };
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
