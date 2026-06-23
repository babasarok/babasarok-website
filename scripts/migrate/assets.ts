/**
 * Asset migration: pull the imagery the site actually uses out of the old
 * Hugo `assets/` tree and into `src/assets/` so Astro can process it and
 * Tina can reference it (`/assets/...`).
 *
 * Strategy:
 *   1. Copy the whole curated `old/assets/images/**` tree (hero, about,
 *      product, service, site-navigation, single-blog) verbatim.
 *   2. Additionally pull in any root-level asset (e.g. `/Noémi-22.jpg`)
 *      referenced from old `data/*.yml` or `content/**` — the assets root
 *      is a large personal photo dump, so we only take what's referenced.
 *   3. Report copied / unchanged / missing references.
 *
 * Idempotent: only writes files whose bytes differ.
 *
 * Run: `node scripts/migrate/assets.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import matter from "gray-matter";
import { OLD, NEW } from "./config.ts";
import {
  assetCandidates,
  copyIfChanged,
  log,
  resolveOldAsset,
  toNewAssetFile,
  toPublicAssetPath,
  walk,
} from "./lib.ts";

interface AssetStats {
  copied: number;
  unchanged: number;
  missing: Set<string>;
}

/** Recursively collect every string value out of a parsed YAML/JSON tree. */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
}

/** Gather asset references from old data + content files. */
function gatherReferencedAssets(): Set<string> {
  const refs = new Set<string>();

  for (const file of walk(OLD.data)) {
    if (!/\.ya?ml$/i.test(file)) continue;
    try {
      const strings: string[] = [];
      collectStrings(parseYaml(fs.readFileSync(file, "utf8")), strings);
      for (const s of strings) for (const r of assetCandidates(s)) refs.add(r);
    } catch (err) {
      log.warn(`Could not parse YAML ${path.relative(OLD.root, file)}: ${err}`);
    }
  }

  for (const file of walk(OLD.content)) {
    if (!/\.(md|mdx|html)$/i.test(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    let body = raw;
    try {
      const parsed = matter(raw);
      const strings: string[] = [];
      collectStrings(parsed.data, strings);
      for (const s of strings) for (const r of assetCandidates(s)) refs.add(r);
      body = parsed.content;
    } catch {
      /* not frontmatter; scan whole file */
    }
    for (const r of assetCandidates(body)) refs.add(r);
  }

  return refs;
}

function copyCuratedImages(stats: AssetStats): void {
  for (const file of walk(OLD.images)) {
    const dest = path.join(NEW.assets, path.relative(OLD.assets, file));
    if (copyIfChanged(file, dest)) stats.copied++;
    else stats.unchanged++;
  }
  // Decorative SVGs/PNGs Hugo served statically (template `images/...` refs).
  // They land alongside the curated images under `src/assets/images/...`.
  for (const file of walk(OLD.staticImages)) {
    const dest = path.join(
      NEW.assets,
      "images",
      path.relative(OLD.staticImages, file),
    );
    if (copyIfChanged(file, dest)) {
      stats.copied++;
      log.dim(`+ /assets/images/${path.relative(OLD.staticImages, file)}`);
    } else stats.unchanged++;
  }
}

function copyReferencedRootAssets(refs: Set<string>, stats: AssetStats): void {
  for (const ref of refs) {
    const abs = resolveOldAsset(ref);
    if (!abs) {
      stats.missing.add(ref);
      continue;
    }
    // Curated images are already handled by copyCuratedImages.
    if (abs.startsWith(OLD.images + path.sep)) continue;
    const dest = toNewAssetFile(abs);
    if (copyIfChanged(abs, dest)) {
      stats.copied++;
      log.dim(`+ ${toPublicAssetPath(abs)}`);
    } else stats.unchanged++;
  }
}

export function migrateAssets(): AssetStats {
  log.step("Migrating assets -> src/assets");
  const stats: AssetStats = { copied: 0, unchanged: 0, missing: new Set() };

  copyCuratedImages(stats);
  copyReferencedRootAssets(gatherReferencedAssets(), stats);

  log.ok(`${stats.copied} copied, ${stats.unchanged} unchanged`);
  if (stats.missing.size) {
    log.warn(`${stats.missing.size} referenced asset(s) not found on disk:`);
    for (const m of [...stats.missing].sort()) log.dim(`  ${m}`);
  }
  return stats;
}

// Run directly: `node scripts/migrate/assets.ts`
if (import.meta.url === `file://${process.argv[1]}`) migrateAssets();
