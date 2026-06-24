/**
 * Content image normalization: rewrite every image reference inside the
 * migrated content markdown (`src/content/**​/*.md`) to TinaCMS's canonical
 * `/assets/...` form.
 *
 * The old Hugo content stored images as root-absolute, sometimes
 * percent-encoded refs (`/IMG_8843.JPG`, `/No%C3%A9mi-25.jpg`,
 * `/images/single-blog/x.jpg`). Tina is configured with
 * `mediaRoot: "assets"` + `publicFolder: "src"`, so it reads/writes media
 * refs as `/assets/<path>` (decoded). With mixed forms the admin media
 * picker can't match the files; normalizing the content makes Tina display
 * them and keeps new uploads consistent.
 *
 * A ref is only rewritten when the target actually exists under
 * `src/assets`; unresolved refs are left untouched and reported (e.g. stray
 * typos or genuinely missing files). Operates on raw text so frontmatter
 * formatting and key order are preserved.
 *
 * Idempotent: re-running is a no-op once everything is `/assets/...`.
 *
 * Run: `node scripts/migrate/images.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { NEW, ASSET_PUBLIC_PREFIX, ASSET_EXTENSIONS } from "./config.ts";
import { log, walk, writeTextIfChanged } from "./lib.ts";

interface ImageStats {
  written: number;
  unchanged: number;
  rewrites: number;
  unresolved: Set<string>;
}

const EXT_GROUP = ASSET_EXTENSIONS.map((e) => e.slice(1)).join("|");

/**
 * Map a content image ref to its canonical `/assets/<rel>` form, or null when
 * the target file does not exist under `src/assets`. Strips an existing
 * `/assets/` prefix (idempotent) and percent-decodes accented filenames.
 */
function canonicalAssetRef(ref: string): string | null {
  const noQuery = ref.split(/[?#]/)[0] ?? "";
  const stripped = noQuery.replace(/^\/+/, "").replace(/^assets\//i, "");
  if (!stripped) return null;

  let decoded = stripped;
  try {
    decoded = decodeURIComponent(stripped);
  } catch {
    /* malformed encoding — fall back to the literal form */
  }

  for (const rel of new Set([decoded, stripped])) {
    if (fs.existsSync(path.join(NEW.assets, rel))) {
      return `${ASSET_PUBLIC_PREFIX}/${rel.split(path.sep).join("/")}`;
    }
  }
  return null;
}

/** Rewrite one ref, tracking stats. Returns the canonical ref or the original. */
function rewriteRef(raw: string, stats: ImageStats): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return raw;
  if (/^https?:/i.test(raw)) return raw;
  const canon = canonicalAssetRef(raw);
  if (!canon) {
    stats.unresolved.add(raw);
    return raw;
  }
  if (canon !== raw) stats.rewrites++;
  return canon;
}

/**
 * Rewrite image references in a markdown file's raw text. Three targeted
 * passes keep us from corrupting unrelated text:
 *   1. Markdown image targets `![alt](url "title")`, incl. `<...>`-wrapped
 *      URLs that may contain spaces.
 *   2. Frontmatter `thumbnail:` / `image:` values (handles spaces/quotes).
 *   3. Any remaining root-absolute asset token (frontmatter lists, etc.).
 */
function rewriteText(text: string, stats: ImageStats): string {
  let out = text;

  // 1. Markdown image syntax — capture the URL, optionally `<...>`-wrapped,
  //    with an optional "title".
  out = out.replace(
    /(!\[[^\]]*\]\(\s*)(<[^>]*>|[^)\s]*)((?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g,
    (full, open: string, rawUrl: string, close: string) => {
      const angle = rawUrl.startsWith("<") && rawUrl.endsWith(">");
      const url = angle ? rawUrl.slice(1, -1) : rawUrl;
      const canon = rewriteRef(url, stats);
      if (canon === url) return full;
      // Wrap in <> when the canonical (decoded) path contains spaces.
      const wrapped = /\s/.test(canon) ? `<${canon}>` : canon;
      return open + wrapped + close;
    },
  );

  // 2. Frontmatter single-value image fields (incl. `- image:` list items),
  //    quoted or not, possibly containing spaces.
  out = out.replace(
    /^(\s*(?:-\s*)?(?:thumbnail|image)\s*:\s*)(['"]?)(.*?)\2[ \t]*$/gim,
    (full, prefix: string, quote: string, value: string) => {
      if (!value.trim()) return full;
      const canon = rewriteRef(value, stats);
      if (canon === value) return full;
      return `${prefix}${quote}${canon}${quote}`;
    },
  );

  // 3. Any remaining root-absolute asset token (e.g. inline links to PDFs).
  out = out.replace(
    new RegExp(`[^\\s"'()<>\\[\\]]*\\.(${EXT_GROUP})`, "giu"),
    (token: string) => rewriteRef(token, stats),
  );

  return out;
}

export function migrateImages(): ImageStats {
  log.step("Normalizing content image refs -> /assets/...");
  const stats: ImageStats = {
    written: 0,
    unchanged: 0,
    rewrites: 0,
    unresolved: new Set(),
  };

  for (const file of walk(NEW.content)) {
    if (!/\.mdx?$/i.test(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const next = rewriteText(raw, stats);
    if (next === raw) {
      stats.unchanged++;
      continue;
    }
    if (writeTextIfChanged(file, next)) {
      stats.written++;
      log.dim(path.relative(NEW.content, file));
    } else stats.unchanged++;
  }

  log.ok(
    `${stats.rewrites} ref(s) rewritten in ${stats.written} file(s), ` +
      `${stats.unchanged} unchanged`,
  );
  if (stats.unresolved.size) {
    log.warn(`${stats.unresolved.size} ref(s) had no file under src/assets:`);
    for (const m of [...stats.unresolved].sort()) log.dim(`  ${m}`);
  }
  return stats;
}

// Run directly: `node scripts/migrate/images.ts`
if (import.meta.url === `file://${process.argv[1]}`) migrateImages();
