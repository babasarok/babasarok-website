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
 * After each sync settles, the display fields of the display-field gap
 * (ADR 0010) land on the native product's custom fields: product images are
 * uploaded as assets (thumbnail → featured asset, gallery → assets, icon →
 * the `icon` relation) and shortDescription/tagline/date are written
 * directly. Asset dedup is per-run only, same as the material seed.
 *
 * TEMPORARY and preview-only: production is seeded once by a hand-migration
 * directly from the repo at cutover, never by this script.
 *
 * Run: pnpm -C backend run import-products
 * (requires the backend running locally and SUPERADMIN_* in backend/.env;
 * overall budget IMPORT_PRODUCTS_SYNC_BUDGET_MINUTES minutes, default 45)
 */
import { openAsBlob } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ProductDefinitionSchema } from "@babasarok/product-definition";
import { ProductGroupDefinitionSchema } from "@babasarok/product-definition";
import { z } from "zod";
import { parse } from "yaml";
import { formatSyncProgress } from "./lib/sync-progress.ts";
import {
  definitionFromTinaProduct,
  displayFromTinaProduct,
  groupDefinitionFromTinaProductGroup,
  type TinaDisplayContent,
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
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
// Undici's own headersTimeout is 300s; ours must fire first to fail with a
// clear message instead of UND_ERR_HEADERS_TIMEOUT.
const REQUEST_TIMEOUT_MS = 240_000;
const RUN_BUDGET_MS = (Number(process.env.IMPORT_PRODUCTS_SYNC_BUDGET_MINUTES) || 45) * 60_000;
// Frequent enough that a slow big-matrix sync never reads as a hang.
const SYNC_PROGRESS_INTERVAL_MS = 30_000;
// TEMPORARY, preview-only (ADR 0009/0010): the preview seed imports a curated
// subset — one product per implemented feature — so the deploy fits inside
// Cloudflare's 30-minute build limit. Covers: input + depends_on
// (cumi-ragcsalanc), choice/select (bella-taska), toggle (kismama-parna),
// embroidery + hiddenInProductList (diszparna), banned combinations
// (babatakaro-szett), length pricing + from-field colorCount + choice/radio
// (fonott-racsvedo), material-only (egyben-moshato-takaro-lapos-parna).
// Choice presentation "color" has no real content yet (e2e covers it).
// At cutover prod is hand-migrated from the full content; drop this filter.
const PREVIEW_PRODUCT_IDS = new Set([
  "babatakaro-szett",
  "bella-taska",
  "cumi-ragcsalanc",
  "diszparna",
  "egyben-moshato-takaro-lapos-parna",
  "fonott-racsvedo",
  "kismama-parna",
]);

interface UpsertResult {
  kind: "created" | "updated";
}

/** A definition whose queued sync the run still waits for. */
interface SyncTarget {
  file: string;
  productId: string;
  startedAt: number;
}

/** A synced target with the native product the display fields land on. */
interface SyncedTarget {
  target: SyncTarget;
  nativeProductId: number | null;
}

interface AdminResult {
  data: unknown;
  errors: string[];
  codes: string[];
}

const CreateAssetsDataSchema = z.object({
  createAssets: z
    .array(z.object({ id: z.string().optional(), message: z.string().optional() }))
    .optional(),
});

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

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
            nativeProductId: z.number().nullish(),
            syncState: z.string(),
            syncError: z.string().nullish(),
          })
        )
        .default([]),
    })
    .default({ items: [] }),
});

let authToken: string | null = null;

async function adminRequest(body: FormData | string): Promise<AdminResult> {
  const headers: Record<string, string> = {
    "Apollo-Require-Preflight": "true",
  };

  if (typeof body === "string") {
    headers["Content-Type"] = "application/json";
  }

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

async function uploadAsset(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const form = new FormData();
  form.append(
    "operations",
    JSON.stringify({
      query: `mutation UploadAsset($files: [CreateAssetInput!]!) {
        createAssets(input: $files) {
          ... on Asset { id name }
          ... on MimeTypeError { errorCode message }
        }
      }`,
      variables: { files: [{ file: null }] },
    })
  );
  form.append("map", JSON.stringify({ 0: ["variables.files.0.file"] }));
  // openAsBlob returns a Promise — FormData.append rejects one, and the
  // part's Content-Type (the Asset's stored mimeType) comes from the Blob
  // type, which openAsBlob leaves empty unless told.
  const blob = await openAsBlob(filePath, {
    type: MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "",
  });
  form.append("0", blob, fileName);

  const created = CreateAssetsDataSchema.parse((await adminRequest(form)).data).createAssets?.[0];

  if (created?.id === undefined) {
    throw new Error(`asset upload failed for ${filePath}: ${created?.message ?? "unknown error"}`);
  }

  return created.id;
}

/** Resolves a Tina image path to a Vendure asset id, re-uploading per run. */
async function assetId(imagePath: string, uploadedByPath: Map<string, string>): Promise<string> {
  const uploaded = uploadedByPath.get(imagePath);

  if (uploaded !== undefined) {
    return uploaded;
  }

  const id = await uploadAsset(path.join(REPO_ROOT, imagePath));
  uploadedByPath.set(imagePath, id);

  return id;
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
  const displayByProductId = new Map<string, TinaDisplayContent>();

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

    if (!PREVIEW_PRODUCT_IDS.has(frontmatter.data.product_id.trim())) {
      // Curated-subset skip: silent per file, counted in the summary.
      skipped += 1;
      continue;
    }

    displayByProductId.set(
      frontmatter.data.product_id.trim(),
      displayFromTinaProduct(frontmatter.data)
    );

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
  const display = await applyDisplayContent(syncs.synced, displayByProductId);
  const seededProductIds = new Set(syncTargets.map((target) => target.productId));
  const groups = await upsertGroups(productIdByFile, seededProductIds);
  const promotion = await upsertSetPromotion(groups.setGroupIds);

  console.log(
    `products: ${created} created, ${updated} updated, ` +
      `${failed} failed, ${skipped} skipped (${files.length} files; preview subset) | ` +
      `syncs: ${syncs.synced.length} synced, ${syncs.failed.length} failed | ` +
      `display: ${display.applied} applied, ${display.failed} failed | ` +
      `groups: ${groups.created} created, ${groups.updated} updated, ${groups.failed} failed, ` +
      `${groups.unseeded} unseeded | promotion: ${promotion}`
  );

  if (failed > 0 || syncs.failed.length > 0 || display.failed > 0) {
    process.exitCode = 1;
  }
}

/**
 * Upserts every product group (discounted sets and related-items groups) and
 * returns the group ids of the upserted discounted sets, for the promotion.
 * Idempotent (upsert by group id): the same script serves the prod
 * hand-migration. Groups whose members are not among the seeded products are
 * skipped — the curated preview subset does not seed every member — and
 * listed, never half-imported.
 */
async function upsertGroups(
  productIdByFile: ReadonlyMap<string, string>,
  seededProductIds: ReadonlySet<string>
): Promise<{
  created: number;
  updated: number;
  failed: number;
  unseeded: number;
  setGroupIds: string[];
}> {
  const files = (await readdir(GROUPS_DIR)).filter((file) => file.endsWith(".md"));
  let created = 0;
  let updated = 0;
  let failed = 0;
  let unseeded = 0;
  const setGroupIds: string[] = [];

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

    const definition = result.data;
    const unseededMembers = definition.productIds.filter((id) => !seededProductIds.has(id));

    if (unseededMembers.length > 0) {
      unseeded += 1;
      console.error(`⚠ ${file}: tag nincs importálva, kihagyva — ${unseededMembers.join(", ")}`);
      continue;
    }

    const outcome = await upsertGroup(definition);

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

    if (definition.kind === "discounted-set") {
      setGroupIds.push(definition.id);
      console.log(
        `✓ ${file}: szett "${definition.label}" — ${definition.productIds.length} termék, kedvezmény ${definition.discount} Ft (${outcome.kind})`
      );
    } else {
      console.log(
        `✓ ${file}: kapcsolódó termékek "${definition.label}" — ${definition.productIds.length} termék (${outcome.kind})`
      );
    }
  }

  return { created, updated, failed, unseeded, setGroupIds };
}

async function upsertGroup(
  definition: z.output<typeof ProductGroupDefinitionSchema>
): Promise<UpsertResult | string> {
  const input = {
    label: definition.label,
    kind: definition.kind,
    discount: definition.kind === "discounted-set" ? definition.discount : null,
    productIds: [...definition.productIds],
  };
  const existing = z
    .object({
      productGroups: z.array(z.object({ groupId: z.string() })).default([]),
    })
    .parse((await adminRequest(JSON.stringify({ query: `{ productGroups { groupId } }` }))).data);
  const isExisting = existing.productGroups.some((row) => row.groupId === definition.id);
  const mutation = isExisting
    ? `mutation Update($groupId: String!, $input: ProductGroupInput!) { updateProductGroup(groupId: $groupId, input: $input) { groupId } }`
    : `mutation Create($groupId: String!, $input: ProductGroupInput!) { createProductGroup(groupId: $groupId, input: $input) { groupId } }`;
  const result = await adminRequest(
    JSON.stringify({
      query: mutation,
      variables: { groupId: definition.id, input },
    })
  );

  if (result.errors.length > 0) {
    return result.errors.join("; ");
  }

  return { kind: isExisting ? "updated" : "created" };
}

/**
 * Upserts the single "Szett kedvezmény" promotion (the set-discount condition
 * plus action) idempotently, keyed by its condition code: found by code, its
 * group list refreshed when it differs, created when absent.
 */
/** Returns a status word, or the error message on failure. */
async function upsertSetPromotion(groupIds: string[]): Promise<string> {
  if (groupIds.length === 0) {
    return "skipped";
  }

  const promotions = z
    .object({
      promotions: z
        .object({
          items: z
            .array(
              z.object({
                id: z.union([z.string(), z.number()]).transform(String),
                name: z.string(),
                enabled: z.boolean(),
                endsAt: z.string().nullish(),
                conditions: z.array(
                  z.object({
                    code: z.string(),
                    args: z.array(z.object({ name: z.string(), value: z.string() })),
                  })
                ),
              })
            )
            .default([]),
        })
        .default({ items: [] }),
    })
    .parse(
      (
        await adminRequest(
          JSON.stringify({
            query: `{ promotions(options: { skip: 0, take: 100 }) { items { id name enabled endsAt conditions { code args { name value } } } } }`,
          })
        )
      ).data
    ).promotions.items;

  const conditions = [
    {
      code: "babasarok-product-set-basket",
      arguments: [{ name: "groupIds", value: JSON.stringify(groupIds) }],
    },
  ];
  const actions = [{ code: "babasarok-product-set-discount", arguments: [] }];
  const existing = promotions.find(
    (promotion) =>
      promotion.endsAt === null &&
      promotion.conditions.some((condition) => condition.code === "babasarok-product-set-basket")
  );

  if (existing !== undefined) {
    const current = existing.conditions.find(
      (condition) => condition.code === "babasarok-product-set-basket"
    );
    const currentIds = promotionGroupIdsFromArgs(
      current?.args.find((argument) => argument.name === "groupIds")?.value
    );

    if (JSON.stringify(currentIds) === JSON.stringify(groupIds)) {
      return "unchanged";
    }

    const result = await adminRequest(
      JSON.stringify({
        query: `mutation Update($input: UpdatePromotionInput!) { updatePromotion(input: $input) { id } }`,
        variables: {
          input: { id: existing.id, enabled: true, conditions, actions },
        },
      })
    );

    if (result.errors.length > 0) {
      return result.errors.join("; ");
    }

    console.log(`→ ${existing.name}: szett-csoportok frissítve`);

    return "updated";
  }

  const result = await adminRequest(
    JSON.stringify({
      query: `mutation Create($input: CreatePromotionInput!) { createPromotion(input: $input) { id } }`,
      variables: {
        input: {
          enabled: true,
          conditions,
          actions,
          translations: [{ languageCode: "hu", name: "Szett kedvezmény" }],
        },
      },
    })
  );

  if (result.errors.length > 0) {
    return result.errors.join("; ");
  }

  return "created";
}

function promotionGroupIdsFromArgs(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }

  try {
    const value: unknown = JSON.parse(raw);

    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Waits for the queued syncs to settle (the worker processes them serially). */
async function waitForSyncs(
  targets: SyncTarget[],
  startedAt: number
): Promise<{ synced: SyncedTarget[]; failed: SyncTarget[] }> {
  const pending = new Map(targets.map((target) => [target.productId, target]));
  const synced: SyncedTarget[] = [];
  const failed: SyncTarget[] = [];
  let lastProgressAt = startedAt;

  while (pending.size > 0) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      for (const target of pending.values()) {
        console.error(`✗ ${target.file}: szinkronizálási időkeret túllépés`);
        failed.push(target);
      }

      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const states = SyncStatesSchema.parse(
      (
        await adminRequest(
          JSON.stringify({
            query: `{ productDefinitions(options: { skip: 0, take: 100 }) { items { productId nativeProductId syncState syncError } } }`,
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
        synced.push({ target, nativeProductId: row.nativeProductId ?? null });
        console.log(`✓ ${target.file}: szinkronizálva (${waited}s)`);
      } else if (row.syncState === "failed") {
        pending.delete(row.productId);
        failed.push(target);
        console.error(`✗ ${target.file}: szinkronizálás sikertelen — ${row.syncError ?? ""}`);
      }
    }

    if (pending.size > 0 && Date.now() - lastProgressAt >= SYNC_PROGRESS_INTERVAL_MS) {
      lastProgressAt = Date.now();
      console.log(
        formatSyncProgress(
          [...pending.values()].map((target) => target.file.replace(/\.md$/, "")),
          Date.now() - startedAt,
          synced.length,
          failed.length
        )
      );
    }
  }

  return { synced, failed };
}

/**
 * Writes the display-field gap content (ADR 0010) onto the synced native
 * products: uploads the product images as assets (thumbnail → featured asset,
 * gallery → assets), sets shortDescription/tagline/date and the icon relation,
 * and writes gallery descriptions onto the uploaded assets. Absent content
 * clears the fields, so a re-run re-establishes known test state.
 */
async function applyDisplayContent(
  synced: ReadonlyArray<SyncedTarget>,
  displayByProductId: ReadonlyMap<string, TinaDisplayContent>,
  uploadedByPath = new Map<string, string>()
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;

  for (const { target, nativeProductId } of synced) {
    const display = displayByProductId.get(target.productId);

    if (display === undefined) {
      continue;
    }

    if (nativeProductId === null) {
      failed += 1;
      console.error(`✗ ${target.file}: a natív termék nem érhető el a megjelenési mezőkhöz`);
      continue;
    }

    console.log(`→ ${target.file}: megjelenési mezők`);

    try {
      const featuredAssetId =
        display.thumbnailPath === null
          ? null
          : await assetId(display.thumbnailPath, uploadedByPath);
      const galleryAssetIds = await Promise.all(
        display.gallery.map((entry) => assetId(entry.imagePath, uploadedByPath))
      );
      const iconId =
        display.iconPath === null ? null : await assetId(display.iconPath, uploadedByPath);

      expectSuccess(
        await adminRequest(
          JSON.stringify({
            query: `mutation UpdateProductDisplay($input: UpdateProductInput!) {
              updateProduct(input: $input) { id }
            }`,
            variables: {
              input: {
                id: String(nativeProductId),
                featuredAssetId,
                assetIds: galleryAssetIds,
                customFields: { date: display.date, iconId },
                translations: [
                  {
                    languageCode: "hu",
                    customFields: {
                      shortDescription: display.shortDescription,
                      tagline: display.tagline,
                    },
                  },
                ],
              },
            },
          })
        )
      );

      for (const [index, entry] of display.gallery.entries()) {
        if (entry.description === null) {
          continue;
        }

        expectSuccess(
          await adminRequest(
            JSON.stringify({
              query: `mutation UpdateAssetGalleryDescription($input: UpdateAssetInput!) {
                updateAsset(input: $input) { id }
              }`,
              variables: {
                input: {
                  id: galleryAssetIds[index],
                  translations: [
                    {
                      languageCode: "hu",
                      customFields: { galleryDescription: entry.description },
                    },
                  ],
                },
              },
            })
          )
        );
      }

      applied += 1;
      console.log(`✓ ${target.file}: megjelenési mezők beállítva`);
    } catch (error: unknown) {
      failed += 1;
      console.error(
        `✗ ${target.file}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`
      );
    }
  }

  return { applied, failed };
}

/** Turns a GraphQL error response into a thrown error for the caller's try/catch. */
function expectSuccess(result: AdminResult): void {
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("; "));
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
