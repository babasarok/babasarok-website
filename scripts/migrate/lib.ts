/**
 * Shared helpers for the migration scripts: filesystem utilities, tiny
 * coloured logging, and asset-reference resolution/rewriting.
 */
import fs from "node:fs";
import path from "node:path";
import { ASSET_EXTENSIONS, ASSET_PUBLIC_PREFIX, OLD, NEW } from "./config.ts";

/* ------------------------------------------------------------------ *
 * Logging
 * ------------------------------------------------------------------ */

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const log = {
  step: (s: string) => console.log(`\n${c.bold(c.cyan(`▸ ${s}`))}`),
  info: (s: string) => console.log(`  ${s}`),
  ok: (s: string) => console.log(`  ${c.green("✓")} ${s}`),
  warn: (s: string) => console.log(`  ${c.yellow("!")} ${s}`),
  err: (s: string) => console.log(`  ${c.red("✗")} ${s}`),
  dim: (s: string) => console.log(`  ${c.dim(s)}`),
};

/* ------------------------------------------------------------------ *
 * Filesystem
 * ------------------------------------------------------------------ */

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(p: string): boolean {
  return fs.existsSync(p);
}

/** Recursively list files under `dir`, returning absolute paths. */
export function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Copy `from` -> `to` only when content differs; returns true if written. */
export function copyIfChanged(from: string, to: string): boolean {
  ensureDir(path.dirname(to));
  if (fs.existsSync(to)) {
    const a = fs.statSync(from);
    const b = fs.statSync(to);
    if (
      a.size === b.size &&
      fs.readFileSync(from).equals(fs.readFileSync(to))
    ) {
      return false;
    }
  }
  fs.copyFileSync(from, to);
  return true;
}

export function writeJsonIfChanged(to: string, data: unknown): boolean {
  const next = JSON.stringify(data, null, 2) + "\n";
  ensureDir(path.dirname(to));
  if (fs.existsSync(to) && fs.readFileSync(to, "utf8") === next) return false;
  fs.writeFileSync(to, next);
  return true;
}

export function writeTextIfChanged(to: string, text: string): boolean {
  ensureDir(path.dirname(to));
  if (fs.existsSync(to) && fs.readFileSync(to, "utf8") === text) return false;
  fs.writeFileSync(to, text);
  return true;
}

/* ------------------------------------------------------------------ *
 * Asset references
 * ------------------------------------------------------------------ */

const ASSET_EXT_RE = new RegExp(
  `\\.(${ASSET_EXTENSIONS.map((e) => e.slice(1)).join("|")})$`,
  "i",
);

export function looksLikeAsset(ref: string): boolean {
  return ASSET_EXT_RE.test(ref.split(/[?#]/)[0] ?? "");
}

/**
 * Find every asset-like path in an arbitrary blob of text (Markdown body,
 * HTML template). Unicode-aware so accented filenames (`Noémi-22.jpg`)
 * survive. Matches runs of path chars ending in an asset extension.
 */
export function findAssetRefs(text: string): string[] {
  const exts = ASSET_EXTENSIONS.map((e) => e.slice(1)).join("|");
  const re = new RegExp(`[^\\s"'()<>\\[\\]]*\\.(${exts})`, "giu");
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    if (/^https?:/i.test(raw)) continue; // skip external URLs
    if (/^\.[A-Za-z0-9]+$/.test(raw)) continue; // skip bare ".jpg" fragments
    seen.add(raw);
  }
  return [...seen];
}

/**
 * Asset references contained in a single field value. When the whole
 * (single-line) value is itself an existing asset — covering paths with
 * spaces or accents like `pólya 1.JPG` — that one ref is returned. Otherwise
 * we fall back to extracting refs from free text (e.g. a Markdown body).
 */
export function assetCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (
    trimmed &&
    !/[\n\r]/.test(trimmed) &&
    looksLikeAsset(trimmed) &&
    resolveOldAsset(trimmed)
  ) {
    return [trimmed];
  }
  return findAssetRefs(value);
}

/**
 * Resolve an old asset reference to its absolute source file under
 * `old/assets`. Hugo refs are relative to the assets root and may or may
 * not carry a leading slash (`/Noémi-22.jpg`, `images/hero/x.svg`).
 * Returns null when the file does not exist on disk.
 */
export function resolveOldAsset(ref: string): string | null {
  const clean = (ref.split(/[?#]/)[0] ?? "").replace(/^\/+/, "");
  if (!clean) return null;
  const candidate = path.join(OLD.assets, decodeURIComponent(clean));
  if (fs.existsSync(candidate)) return candidate;
  // Fall back to the raw (non-decoded) name in case it was already literal.
  const literal = path.join(OLD.assets, clean);
  return fs.existsSync(literal) ? literal : null;
}

/** Public `/assets/...` path for a resolved old asset's relative location. */
export function toPublicAssetPath(absOldAsset: string): string {
  const rel = path.relative(OLD.assets, absOldAsset).split(path.sep).join("/");
  return `${ASSET_PUBLIC_PREFIX}/${rel}`;
}

/** Destination under `src/assets` for a resolved old asset. */
export function toNewAssetFile(absOldAsset: string): string {
  const rel = path.relative(OLD.assets, absOldAsset);
  return path.join(NEW.assets, rel);
}

/** Rewrite an old asset ref string to its new `/assets/...` form (or null). */
export function rewriteAssetRef(ref: string): string | null {
  const abs = resolveOldAsset(ref);
  return abs ? toPublicAssetPath(abs) : null;
}
