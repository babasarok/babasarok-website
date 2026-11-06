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
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ProductDefinitionSchema } from "../src/shared/product-definition/index";
import { ProductGroupDefinitionSchema } from "../src/shared/product-definition/index";
import { z } from "zod";
import { parse } from "yaml";
import { adminRequest, authenticate, uploadAsset } from "./lib/admin-client";
import { assignProductFacetValue, ensureFacetWithValues } from "./lib/facet-seed";
import { formatSyncProgress } from "./lib/sync-progress";
import {
  definitionFromTinaProduct,
  displayFromTinaProduct,
  groupDefinitionFromTinaProductGroup,
  popularityRanks,
  type TinaDisplayContent,
  TinaProductGroupSchema,
  TinaProductSchema,
} from "./lib/tina-source";
/** The definition shape sent to the admin API (server-side zod validates it). */
type DefinitionPayload = z.input<typeof ProductDefinitionSchema>;

const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "content", "product");
const GROUPS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "content",
  "product_groups"
);
const PRODUCT_SECTION_FILE = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "content",
  "sections",
  "product.json"
);
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
// Vendure's built-in product-id collection filter and the set-discount
// promotion operations; the codes also live in
// backend/src/plugins/product-set/promotion.ts — keep in sync.
const PRODUCT_ID_FILTER_CODE = "product-id-filter";
const PRODUCT_SET_CONDITION_CODE = "babasarok-product-set-basket";
const PRODUCT_SET_ACTION_CODE = "babasarok-product-set-discount";
// Also defined in backend/src/plugins/product/facet-plan.ts — keep in sync.
const PRODUCT_TYPE_FACET_CODE = "babasarok-product-type";
const RUN_BUDGET_MS = (Number(process.env.IMPORT_PRODUCTS_SYNC_BUDGET_MINUTES) || 45) * 60_000;
// Frequent enough that a slow big-matrix sync never reads as a hang.
const SYNC_PROGRESS_INTERVAL_MS = 30_000;
// TEMPORARY, preview-only (ADR 0009/0010): the preview seed imports a curated
// subset so the deploy fits inside Cloudflare's 30-minute build limit. The
// first eight entries cover one product per implemented feature: input +
// depends_on (cumi-ragcsalanc), choice/select (bella-taska), toggle
// (kismama-parna), embroidery + hiddenInProductList (diszparna), banned
// combinations (babatakaro-szett), length pricing + from-field colorCount +
// choice/radio (fonott-racsvedo), material-only
// (egyben-moshato-takaro-lapos-parna). The remaining eight complete the
// product groups: tornazsak + vallfas-zsak finish the ovis-szett set
// (discounted sets need every member), and the six ovis-felszereles members
// fill the related-items group — every one of them is a one-variant product,
// so the extension costs seconds of sync and stays well inside the limit.
// Choice presentation "color" has no real content yet (e2e covers it).
// At cutover prod is hand-migrated from the full content; drop this filter.
// Entries are product_ids, not filenames — filenames and product ids diverge
// in legacy files (bella-taska.md → Oko-taska, cumi-ragcsalanc.md → cumilanc,
// fonott-racsvedo.md → racsvedo).
const PREVIEW_PRODUCT_IDS = new Set([
  "babatakaro-szett",
  "Oko-taska",
  "cumilanc",
  "diszparna",
  "egyben-moshato-takaro-lapos-parna",
  "racsvedo",
  "kismama-parna",
  "paplan-parnahuzat",
  "pufi-parna",
  "pufi-parna-huzat",
  "sima-takaro-lapos-parna",
  "tornazsak",
  "vallfas-zsak",
  "vizhatlan-lepedo",
  "vizhatlan-lepedo-ketretegu",
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

async function upsert(definition: DefinitionPayload, name: string): Promise<UpsertResult | string> {
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
        query: `mutation Create($definition: JSON!, $name: String!) { createProductDefinition(definition: $definition, name: $name) { productId } }`,
        variables: { definition, name },
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
  const ranks = popularityRanks(JSON.parse(await readFile(PRODUCT_SECTION_FILE, "utf8")));

  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const syncTargets: SyncTarget[] = [];
  const productIdByFile = new Map<string, string>();
  const displayByProductId = new Map<string, TinaDisplayContent>();
  const typeByProductId = new Map<string, string>();

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
      displayFromTinaProduct(frontmatter.data, {
        slug: file.replace(/\.md$/, ""),
        popularityRank: ranks.get(file.replace(/\.md$/, "")) ?? null,
      })
    );

    typeByProductId.set(frontmatter.data.product_id.trim(), frontmatter.data.type.trim());

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
      outcome = await upsert(final, definition.name);
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

  const unknownPreviewIds = [...PREVIEW_PRODUCT_IDS].filter(
    (id) => !new Set(productIdByFile.values()).has(id)
  );

  if (unknownPreviewIds.length > 0) {
    throw new Error(
      `PREVIEW_PRODUCT_IDS lists product_id(s) that no Tina product defines: ` +
        `${unknownPreviewIds.join(", ")}. The set is keyed by product_id, not by ` +
        "filename — filenames and product ids diverge in a few legacy files " +
        "(see scripts/lib/tina-source.ts); use the file's product_id."
    );
  }

  const syncs = await waitForSyncs(syncTargets, startedAt);
  const display = await applyDisplayContent(syncs.synced, displayByProductId);
  const types = await applyProductTypes(syncs.synced, typeByProductId);
  const seededProductIds = new Set(syncTargets.map((target) => target.productId));
  const nativeProductIdByProductId = new Map(
    syncs.synced.flatMap((synced) =>
      synced.nativeProductId === null
        ? []
        : [[synced.target.productId, synced.nativeProductId] as const]
    )
  );
  const groups = await upsertGroups(productIdByFile, seededProductIds, nativeProductIdByProductId);
  const promotion = await upsertSetPromotion();

  console.log(
    `products: ${created} created, ${updated} updated, ` +
      `${failed} failed, ${skipped} skipped (${files.length} files; preview subset) | ` +
      `syncs: ${syncs.synced.length} synced, ${syncs.failed.length} failed | ` +
      `display: ${display.applied} applied, ${display.failed} failed | ` +
      `types: ${types.applied} applied, ${types.failed} failed | ` +
      `groups: ${groups.created} created, ${groups.unchanged} unchanged, ${groups.updated} updated, ` +
      `${groups.failed} failed, ${groups.unseeded} unseeded | promotion: ${promotion}`
  );

  if (failed > 0 || syncs.failed.length > 0 || display.failed > 0 || types.failed > 0) {
    process.exitCode = 1;
  }
}

/**
 * Assigns each synced product its Tina `type` as a value of the product-type
 * facet (ADR 0011 decision 2); the facet and its values come from
 * import-facets.
 */
async function applyProductTypes(
  synced: ReadonlyArray<SyncedTarget>,
  typeByProductId: ReadonlyMap<string, string>
): Promise<{ applied: number; failed: number }> {
  const facet = await ensureFacetWithValues(
    adminRequest,
    { code: PRODUCT_TYPE_FACET_CODE, name: "Terméktípus", isPrivate: false },
    []
  );
  let applied = 0;
  let failed = 0;

  for (const { target, nativeProductId } of synced) {
    const type = typeByProductId.get(target.productId);
    const value = type === undefined ? undefined : facet.valuesByCode.get(type);

    if (nativeProductId === null || value === undefined) {
      failed += 1;
      console.error(
        `✗ ${target.file}: a(z) "${type ?? ""}" terméktípus nem rendelhető hozzá (futott az import-facets?)`
      );
      continue;
    }

    try {
      await assignProductFacetValue(
        adminRequest,
        nativeProductId,
        PRODUCT_TYPE_FACET_CODE,
        value.id
      );
      applied += 1;
    } catch (error: unknown) {
      failed += 1;
      console.error(
        `✗ ${target.file}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`
      );
    }
  }

  return { applied, failed };
}

/**
 * Upserts every product group as a private child collection of its kind's
 * parent ("Szettek" / "Kapcsolódó termékek"): members into the native
 * product-id-filter (native product ids), the discounted set's flat amount
 * into the setDiscount custom field. Idempotent (upsert by slug): the same
 * script serves the prod hand-migration. Discounted sets need every member
 * among the seeded products and are skipped otherwise; related-items groups
 * seed with the seeded subset when at least two members remain.
 */
async function upsertGroups(
  productIdByFile: ReadonlyMap<string, string>,
  seededProductIds: ReadonlySet<string>,
  nativeProductIdByProductId: ReadonlyMap<string, number>
): Promise<{
  created: number;
  unchanged: number;
  updated: number;
  failed: number;
  unseeded: number;
}> {
  const files = (await readdir(GROUPS_DIR)).filter((file) => file.endsWith(".md"));
  const parents = await ensureGroupParents();
  let created = 0;
  let unchanged = 0;
  let updated = 0;
  let failed = 0;
  let unseeded = 0;

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
    const isSet = definition.kind === "discounted-set";
    const memberIds = isSet
      ? [...definition.productIds]
      : definition.productIds.filter((productId) => seededProductIds.has(productId));
    const missing = definition.productIds.filter((productId) => !seededProductIds.has(productId));

    if (isSet ? missing.length > 0 : memberIds.length < 2) {
      unseeded += 1;
      console.error(`⚠ ${file}: tag nincs importálva, kihagyva — ${missing.join(", ")}`);
      continue;
    }

    const nativeIds: number[] = [];

    for (const productId of memberIds) {
      const nativeProductId = nativeProductIdByProductId.get(productId);

      if (nativeProductId === undefined) {
        failed += 1;
        console.error(`✗ ${file}: ${productId} natív terméke nem ismert`);
        break;
      }

      nativeIds.push(nativeProductId);
    }

    if (nativeIds.length !== memberIds.length) {
      continue;
    }

    const parent = isSet ? parents.szettek : parents.kapcsolodoTermekek;
    const outcome = await upsertGroupCollection(parent, {
      slug: definition.id,
      name: definition.label,
      nativeIds,
      setDiscount: isSet ? definition.discount : null,
    });

    if (!outcome.ok) {
      failed += 1;
      console.error(`✗ ${file}: ${outcome.error}`);
      continue;
    }

    if (outcome.status === "created") {
      created += 1;
    } else if (outcome.status === "unchanged") {
      unchanged += 1;
    } else {
      updated += 1;
    }

    if (isSet) {
      console.log(
        `✓ ${file}: szett "${definition.label}" — ${nativeIds.length} termék, kedvezmény ${definition.discount} Ft (${outcome.status})`
      );
    } else {
      console.log(
        `✓ ${file}: kapcsolódó termékek "${definition.label}" — ${nativeIds.length} termék (${outcome.status})`
      );
    }
  }

  return { created, unchanged, updated, failed, unseeded };
}

interface GroupCollectionInput {
  slug: string;
  name: string;
  nativeIds: number[];
  setDiscount: number | null;
}

interface GroupParentIds {
  szettek: string;
  kapcsolodoTermekek: string;
}

/** A collection upsert's result: a status word, or the error message on failure. */
type CollectionUpsert =
  { ok: true; status: "created" | "unchanged" | "updated" } | { ok: false; error: string };

const SET_PARENT: GroupCollectionInput = {
  slug: "szettek",
  name: "Szettek",
  nativeIds: [],
  setDiscount: null,
};
const RELATED_PARENT: GroupCollectionInput = {
  slug: "kapcsolodo-termekek",
  name: "Kapcsolódó termékek",
  nativeIds: [],
  setDiscount: null,
};
// Both slugs are also read by backend/src/plugins/product-set/
// group-parents.ts (the set promotion and the shop's productGroups); keep in sync.

function productFilterArguments(
  nativeIds: number[]
): { code: string; arguments: { name: string; value: string }[] }[] {
  return [
    {
      code: PRODUCT_ID_FILTER_CODE,
      arguments: [
        { name: "productIds", value: JSON.stringify(nativeIds) },
        { name: "combineWithAnd", value: JSON.stringify(true) },
      ],
    },
  ];
}

/**
 * The existing group collections, keyed by their (hu) slug. The translations
 * are read explicitly, so the response is independent of the admin request's
 * context language.
 */
async function listGroupCollections(): Promise<
  Map<
    string,
    {
      id: string;
      name: string | null;
      parentId: string | null;
      isPrivate: boolean | null;
      filterProductIds: string | null;
      setDiscount: number | null;
    }
  >
> {
  const collections = z
    .object({
      collections: z
        .object({
          items: z
            .array(
              z.object({
                id: z.union([z.string(), z.number()]).transform(String),
                isPrivate: z.boolean().nullish(),
                parentId: z
                  .union([z.string(), z.number()])
                  .nullish()
                  .transform((v) => (v == null ? null : String(v))),
                translations: z
                  .array(
                    z.object({
                      languageCode: z.string(),
                      name: z.string().nullable(),
                      slug: z.string(),
                    })
                  )
                  .default([]),
                filters: z
                  .array(
                    z.object({
                      code: z.string(),
                      args: z.array(z.object({ name: z.string(), value: z.string() })),
                    })
                  )
                  .default([]),
                customFields: z.object({ setDiscount: z.number().nullish() }).nullish(),
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
            query: `{ collections(options: { skip: 0, take: 250 }) { items { id isPrivate parentId translations { languageCode name slug } filters { code args { name value } } customFields { setDiscount } } } }`,
          })
        )
      ).data
    ).collections.items;

  const bySlug = new Map<
    string,
    {
      id: string;
      name: string | null;
      parentId: string | null;
      isPrivate: boolean | null;
      filterProductIds: string | null;
      setDiscount: number | null;
    }
  >();

  for (const collection of collections) {
    const hu = collection.translations.find((t) => t.languageCode === "hu");

    if (hu === undefined) {
      continue;
    }

    const filter = collection.filters.find((f) => f.code === PRODUCT_ID_FILTER_CODE);

    bySlug.set(hu.slug, {
      id: collection.id,
      name: hu.name,
      parentId: collection.parentId,
      isPrivate: collection.isPrivate ?? null,
      filterProductIds: filter?.args.find((a) => a.name === "productIds")?.value ?? null,
      setDiscount: collection.customFields?.setDiscount ?? null,
    });
  }

  return bySlug;
}

/**
 * Upserts both private parents. The parents carry no members and no discount;
 * they only classify the group children.
 */
async function ensureGroupParents(): Promise<GroupParentIds> {
  const existing = await listGroupCollections();

  for (const parent of [SET_PARENT, RELATED_PARENT]) {
    const outcome = await upsertGroupCollection(null, parent, existing);

    if (!outcome.ok) {
      throw new Error(`A(z) "${parent.name}" szülő gyűjtemény nem upsertelhető: ${outcome.error}`);
    }
  }

  const ids = await listGroupCollections();
  const szettek = ids.get(SET_PARENT.slug)?.id;
  const kapcsolodoTermekek = ids.get(RELATED_PARENT.slug)?.id;

  if (szettek === undefined || kapcsolodoTermekek === undefined) {
    throw new Error("A csoport-szülő gyűjtemények hiányoznak az upsert után.");
  }

  return { szettek, kapcsolodoTermekek };
}

/**
 * Creates the collection when its slug is unknown, and updates only the
 * fields that differ otherwise.
 */
async function upsertGroupCollection(
  parentId: string | null,
  group: GroupCollectionInput,
  existingBySlug?: Awaited<ReturnType<typeof listGroupCollections>>
): Promise<CollectionUpsert> {
  const existing = (existingBySlug ?? (await listGroupCollections())).get(group.slug);
  const filters = productFilterArguments(group.nativeIds);

  if (existing === undefined) {
    const result = await adminRequest(
      JSON.stringify({
        query: `mutation Create($input: CreateCollectionInput!) { createCollection(input: $input) { id } }`,
        variables: {
          input: {
            isPrivate: true,
            parentId,
            filters,
            translations: [
              { languageCode: "hu", name: group.name, slug: group.slug, description: "" },
            ],
            customFields: { setDiscount: group.setDiscount },
          },
        },
      })
    );

    if (result.errors.length > 0) {
      return { ok: false, error: result.errors.join("; ") };
    }

    return { ok: true, status: "created" };
  }

  const input: Record<string, unknown> = { id: existing.id };

  if (existing.name !== group.name) {
    input.translations = [{ languageCode: "hu", name: group.name }];
  }

  const desiredFilterValue = filters[0]?.arguments.find((a) => a.name === "productIds")?.value;

  if (existing.filterProductIds !== desiredFilterValue) {
    input.filters = filters;
  }

  if (existing.setDiscount !== group.setDiscount) {
    input.customFields = { setDiscount: group.setDiscount };
  }

  if (Object.keys(input).length === 1) {
    return { ok: true, status: "unchanged" };
  }

  const result = await adminRequest(
    JSON.stringify({
      query: `mutation Update($input: UpdateCollectionInput!) { updateCollection(input: $input) { id } }`,
      variables: { input },
    })
  );

  if (result.errors.length > 0) {
    return { ok: false, error: result.errors.join("; ") };
  }

  return { ok: true, status: "updated" };
}

/**
 * Upserts the single "Szett kedvezmény" promotion (the set-discount condition
 * plus action) idempotently, keyed by its condition code: created when
 * absent, enabled when disabled. The condition takes no arguments — it reads
 * the "Szettek" parent's children itself — and refuses to apply when more
 * than one active promotion uses it, so the seed reports a duplicate instead
 * of creating a second copy.
 */
/** Returns a status word, or the error message on failure. */
async function upsertSetPromotion(): Promise<string> {
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

  const withCondition = promotions.filter((promotion) =>
    promotion.conditions.some((condition) => condition.code === PRODUCT_SET_CONDITION_CODE)
  );

  if (withCondition.length > 1) {
    return `több szett-kedvezmény promóció létezik: ${withCondition.map((p) => p.name).join(", ")}`;
  }

  if (withCondition.length === 1) {
    const existing = withCondition[0];

    if (existing.enabled) {
      return "unchanged";
    }

    const result = await adminRequest(
      JSON.stringify({
        query: `mutation Update($input: UpdatePromotionInput!) { updatePromotion(input: $input) { ... on Promotion { id } } }`,
        variables: {
          input: {
            id: existing.id,
            enabled: true,
            conditions: [{ code: PRODUCT_SET_CONDITION_CODE, arguments: [] }],
            actions: [{ code: PRODUCT_SET_ACTION_CODE, arguments: [] }],
          },
        },
      })
    );

    if (result.errors.length > 0) {
      return result.errors.join("; ");
    }

    console.log(`→ ${existing.name}: engedélyezve`);

    return "updated";
  }

  const result = await adminRequest(
    JSON.stringify({
      query: `mutation Create($input: CreatePromotionInput!) { createPromotion(input: $input) { ... on Promotion { id } } }`,
      variables: {
        input: {
          enabled: true,
          conditions: [{ code: PRODUCT_SET_CONDITION_CODE, arguments: [] }],
          actions: [{ code: PRODUCT_SET_ACTION_CODE, arguments: [] }],
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
 * gallery → assets), sets shortDescription/tagline/date/popularityRank, the slug (the Tina file name, i.e. the current site URL) and the icon relation,
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
                customFields: {
                  date: display.date,
                  iconId,
                  popularityRank: display.popularityRank,
                },
                translations: [
                  {
                    languageCode: "hu",
                    slug: display.slug,
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
function expectSuccess(result: Awaited<ReturnType<typeof adminRequest>>): void {
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
