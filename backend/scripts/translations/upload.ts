import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { readCatalogSnapshot, type AdminApi } from "./catalog-snapshot";
import {
  translatableStrings,
  type StringCategory,
  type TranslatableString,
} from "./translatable-strings";
import {
  MUTATIONS,
  planUpload,
  type TranslationFile,
  type UploadOperation,
  type UploadPlan,
} from "./upload-plan";
import { verificationProblems } from "./verify-upload";

const SYNC_QUEUE = "product-definition-sync";

/** Writes that enqueue definition syncs: the definition, a material it references, a product rename. */
const SYNCING_CATEGORIES: ReadonlySet<StringCategory> = new Set([
  "product",
  "material",
  "definition",
]);

export interface UploadOptions {
  write: boolean;
  /** Overwrite native drift on definitions (the owner's direct variant edits). */
  force: boolean;
  log: (line: string) => void;
  pollMs: number;
  syncTimeoutMs: number;
}

const OpenJobsSchema = z.object({ jobs: z.object({ totalItems: z.number() }) });

const SyncStateSchema = z.object({
  productDefinition: z.object({
    syncState: z.string(),
    syncError: z.string().nullable(),
    stale: z.boolean(),
  }),
});

const MutationResultSchema = z.record(
  z.string(),
  z.object({
    __typename: z.string(),
    errorCode: z.string().optional(),
    message: z.string().optional(),
  })
);

async function openSyncJobs(api: AdminApi): Promise<number> {
  const { jobs } = await api.request(
    `query($queue: String!) {
      jobs(options: { take: 1, filter: { queueName: { eq: $queue }, state: { in: ["PENDING", "RUNNING", "RETRYING"] } } }) { totalItems }
    }`,
    { queue: SYNC_QUEUE },
    OpenJobsSchema
  );

  return jobs.totalItems;
}

/**
 * Bulk writes must not overlap each other or a running sync (the 2026-11-08
 * outage). The queue is shared by every client, so it is the cross-machine
 * check that a dev-machine lock cannot be.
 */
async function assertQueueQuiet(api: AdminApi): Promise<void> {
  const open = await openSyncJobs(api);

  if (open > 0) {
    throw new Error(
      `${open} definition sync job(s) are queued or running: an owner save, a bulk write or another upload is in progress. ` +
        `Wait until the "${SYNC_QUEUE}" queue is empty (dashboard → System → Job queue), then re-run. Nothing was written.`
    );
  }
}

/** Two quiet polls in a row: event-driven enqueues (material, rename) land just after the mutation returns. */
async function waitForQuietQueue(api: AdminApi, options: UploadOptions): Promise<void> {
  const deadline = Date.now() + options.syncTimeoutMs;
  let quietPolls = 0;

  while (quietPolls < 2) {
    if (Date.now() > deadline) {
      throw new Error(
        `the "${SYNC_QUEUE}" queue did not drain within ${options.syncTimeoutMs / 60_000} min; ` +
          `stopped before the next write. Check the worker, then re-run (finished writes are skipped).`
      );
    }

    await sleep(options.pollMs);

    if ((await openSyncJobs(api)) > 0) {
      quietPolls = 0;
      continue;
    }

    quietPolls += 1;
  }
}

async function definitionState(
  api: AdminApi,
  productId: string
): Promise<z.infer<typeof SyncStateSchema>["productDefinition"]> {
  const { productDefinition } = await api.request(
    `query($productId: String!) { productDefinition(productId: $productId) { syncState syncError stale } }`,
    { productId },
    SyncStateSchema
  );

  return productDefinition;
}

/** A stale definition would make the forced save overwrite the owner's native edits. */
async function assertDefinitionsInSync(api: AdminApi, plan: UploadPlan): Promise<void> {
  const stale: string[] = [];

  for (const operation of plan.operations) {
    if (operation.category !== "definition") {
      continue;
    }

    if ((await definitionState(api, operation.productId)).stale) {
      stale.push(operation.productId);
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `these definitions have native drift: ${stale.join(", ")}. Review it on each definition's dashboard page; ` +
        `re-run with --force only if overwriting it is intended. Nothing was written.`
    );
  }
}

async function apply(api: AdminApi, operation: UploadOperation): Promise<void> {
  const result = await api
    .request(MUTATIONS[operation.mutation], operation.variables, MutationResultSchema)
    .catch((error: unknown) => {
      throw new Error(`${operation.entity} (${operation.mutation}) failed: ${String(error)}`, {
        cause: error,
      });
    });
  const outcome = Object.values(result).at(0);

  if (outcome?.errorCode !== undefined) {
    throw new Error(`${operation.entity}: ${outcome.errorCode} ${outcome.message ?? ""}`);
  }
}

function readsDefinitions(file: TranslationFile): boolean {
  return file.strings.some((entry) => entry.key.startsWith("definition|"));
}

async function liveStrings(api: AdminApi, file: TranslationFile): Promise<TranslatableString[]> {
  const snapshot = await readCatalogSnapshot(api, { definitions: readsDefinitions(file) });

  return translatableStrings(snapshot, file.language);
}

function describePlan(plan: UploadPlan, options: UploadOptions): void {
  const counts = new Map<string, number>();

  for (const operation of plan.operations) {
    counts.set(operation.category, (counts.get(operation.category) ?? 0) + operation.writes.length);
  }

  const writes = plan.operations.reduce((sum, operation) => sum + operation.writes.length, 0);

  options.log(
    `planned ${writes} write(s) in ${plan.operations.length} mutation(s), ${plan.alreadyDone.length} already live: ` +
      JSON.stringify(Object.fromEntries(counts))
  );
}

/**
 * Adds the file's translations to the live catalog: dry-run unless
 * `options.write`. Writes one entity at a time in plan order, drains the
 * sync queue after each write that enqueues syncs, and verifies after each
 * category; any problem stops the run before the next write.
 */
export async function runUpload(
  api: AdminApi,
  file: TranslationFile,
  options: UploadOptions
): Promise<void> {
  await assertQueueQuiet(api);

  const snapshot = await readCatalogSnapshot(api, { definitions: readsDefinitions(file) });
  const before = translatableStrings(snapshot, file.language);
  const plan = planUpload(snapshot, file, { force: options.force });

  describePlan(plan, options);

  if (!options.force) {
    await assertDefinitionsInSync(api, plan);
  }

  if (!options.write) {
    for (const operation of plan.operations) {
      for (const write of operation.writes) {
        options.log(
          `${write.key} | ${operation.entity} | ${JSON.stringify(write.source)} → ${JSON.stringify(write.translation)}`
        );
      }
    }

    options.log("dry run: nothing was written. Re-run with --write to apply.");

    return;
  }

  const written = new Set<string>();

  for (const [index, operation] of plan.operations.entries()) {
    await apply(api, operation);

    for (const write of operation.writes) {
      written.add(write.key);
    }

    options.log(`ok ${operation.entity} (${operation.writes.length} string(s))`);

    if (SYNCING_CATEGORIES.has(operation.category)) {
      await waitForQuietQueue(api, options);
    }

    if (operation.category === "definition") {
      const state = await definitionState(api, operation.productId);

      if (state.syncState !== "synced") {
        throw new Error(
          `${operation.entity}: sync ended "${state.syncState}" (${state.syncError ?? "no error"}); stopped before the next write.`
        );
      }
    }

    if (plan.operations[index + 1]?.category === operation.category) {
      continue;
    }

    const problems = verificationProblems(before, await liveStrings(api, file), file, written);

    if (problems.length > 0) {
      throw new Error(
        `verification failed after ${operation.category}:\n  ${problems.join("\n  ")}`
      );
    }

    options.log(`verified through ${operation.category}: ${written.size} string(s) written`);
  }

  const after = await liveStrings(api, file);
  const derived = after.filter((string) => string.derived);
  const derivedMissing = derived.filter((string) => string.current === undefined).length;

  options.log(
    `done: ${written.size} written, ${plan.alreadyDone.length} already live. ` +
      `Derived material/color facet values without ${file.language}: ${derivedMissing}/${derived.length}.`
  );
}

/** Throws unless every file entry is live with its translation and an unchanged source. */
export async function verifyUpload(
  api: AdminApi,
  file: TranslationFile,
  log: (line: string) => void
): Promise<void> {
  const snapshot = await readCatalogSnapshot(api, { definitions: readsDefinitions(file) });
  const plan = planUpload(snapshot, file, { force: false });
  const missing = plan.operations.flatMap((operation) => operation.writes.map((w) => w.key));

  if (missing.length > 0) {
    throw new Error(`${missing.length} string(s) are not live yet:\n  ${missing.join("\n  ")}`);
  }

  log(
    `all ${plan.alreadyDone.length} string(s) are live in ${file.language}, Hungarian unchanged.`
  );
}
