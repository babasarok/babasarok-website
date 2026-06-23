/**
 * Migration orchestrator — runs every conversion step in order.
 *
 *   node scripts/migrate/index.ts            # all steps
 *   node scripts/migrate/index.ts assets     # only assets
 *   node scripts/migrate/index.ts content    # only section data
 *   node scripts/migrate/index.ts report     # only the Bootstrap→Tailwind report
 *
 * (Also wired as `npm run migrate` / `npm run migrate -- assets`.)
 *
 * Every step is idempotent, so re-run freely while iterating on the
 * migration and fixing bugs.
 */
import { migrateAssets } from "./assets.ts";
import { migrateContent } from "./content.ts";
import { buildBootstrapReport } from "./bootstrap-report.ts";
import { log } from "./lib.ts";

const steps: Record<string, () => unknown> = {
  assets: migrateAssets,
  content: migrateContent,
  report: buildBootstrapReport,
};

const arg = process.argv[2];

if (arg && !steps[arg]) {
  log.err(`Unknown step "${arg}". Valid: ${Object.keys(steps).join(", ")}`);
  process.exit(1);
}

const toRun = arg ? [arg] : Object.keys(steps);
for (const name of toRun) steps[name]();

log.step("Migration complete");
