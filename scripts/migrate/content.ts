/**
 * Content/data migration: convert the old Hugo landing-section data
 * (`old/data/*.yml`) into normalized JSON under `src/content/sections/`,
 * rewriting every asset reference to its new `/assets/...` form.
 *
 * The emitted JSON is the source the Tina section collections read. We
 * model Tina collections incrementally as each section is built; this
 * script keeps the data in sync from the frozen Hugo source so the
 * migration can be re-run safely.
 *
 * Idempotent: only writes files whose content differs.
 *
 * Run: `node scripts/migrate/content.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  NEW,
  OLD,
  SECTIONS,
  SECTION_DATA_FILE,
  type SectionName,
} from "./config.ts";
import {
  assetCandidates,
  log,
  rewriteAssetRef,
  writeJsonIfChanged,
} from "./lib.ts";

interface ContentStats {
  written: number;
  unchanged: number;
  missingFiles: string[];
  unresolved: Set<string>;
}

/**
 * Deep-clone `value`, rewriting any asset reference found inside strings to
 * its new `/assets/...` path. Unresolved refs are recorded for reporting.
 */
function rewriteAssets(value: unknown, unresolved: Set<string>): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const ref of assetCandidates(value)) {
      const next = rewriteAssetRef(ref);
      if (next) out = out.split(ref).join(next);
      else unresolved.add(ref);
    }
    return out;
  }
  if (Array.isArray(value))
    return value.map((v) => rewriteAssets(v, unresolved));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = rewriteAssets(v, unresolved);
    return out;
  }
  return value;
}

function migrateSection(section: SectionName, stats: ContentStats): void {
  const src = path.join(OLD.data, SECTION_DATA_FILE[section]);
  if (!fs.existsSync(src)) {
    stats.missingFiles.push(SECTION_DATA_FILE[section]);
    return;
  }
  const parsed = parseYaml(fs.readFileSync(src, "utf8"));
  const data = rewriteAssets(parsed, stats.unresolved);
  const dest = path.join(NEW.sections, `${section}.json`);
  if (writeJsonIfChanged(dest, data)) {
    stats.written++;
    log.dim(`${section} -> src/content/sections/${section}.json`);
  } else stats.unchanged++;
}

export function migrateContent(): ContentStats {
  log.step("Migrating section data -> src/content/sections");
  const stats: ContentStats = {
    written: 0,
    unchanged: 0,
    missingFiles: [],
    unresolved: new Set(),
  };

  for (const section of SECTIONS) migrateSection(section, stats);

  log.ok(`${stats.written} written, ${stats.unchanged} unchanged`);
  if (stats.missingFiles.length)
    log.warn(`Missing source data: ${stats.missingFiles.join(", ")}`);
  if (stats.unresolved.size) {
    log.warn(`${stats.unresolved.size} asset ref(s) could not be resolved:`);
    for (const m of [...stats.unresolved].sort()) log.dim(`  ${m}`);
  }
  return stats;
}

// Run directly: `node scripts/migrate/content.ts`
if (import.meta.url === `file://${process.argv[1]}`) migrateContent();
