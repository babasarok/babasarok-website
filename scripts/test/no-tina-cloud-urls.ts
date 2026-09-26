/**
 * Build-output guard: fail when a Tina Cloud asset URL leaks into `dist/`.
 *
 * In cloud builds Tina rewrites image fields to an absolute CDN URL of the form
 * `https://assets.tina.io/<id>/__staging/<branch>/__file/<path>`. Those should
 * be reduced back to a local `src/assets` module by `resolveImage` (see
 * src/lib/assets/index.ts) and optimized by Astro. A surviving `assets.tina.io`
 * reference in the output means an image field was never resolved and the page
 * ships a hot-link to Tina Cloud instead of a hashed local asset.
 *
 * The Tina admin SPA (`dist/admin`) legitimately talks to Tina Cloud, so it is
 * excluded.
 *
 * Run after a build: `node scripts/test/no-tina-cloud-urls.ts`
 * Exits non-zero (and prints offenders) when any leak is found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIST_DIR = "dist";
/** Output subtrees allowed to reference Tina Cloud (relative to DIST_DIR). */
const EXCLUDED_DIRS = ["admin"];
/** Only scan text-like output; images/fonts/etc. can't carry a leaked URL. */
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".map",
  ".xml",
  ".txt",
  ".svg",
  ".webmanifest",
  ".rss",
]);

/**
 * Matches a Tina Cloud asset URL, e.g. https://assets.tina.io/<id>/__file/...
 * `&` is excluded so the match stops cleanly at an HTML-encoded quote
 * (`&quot;`) when the URL is embedded in serialized island props.
 */
const TINA_CLOUD_URL = /https?:\/\/assets\.tina\.io\/[^\s"'`)\\<>&]*/gi;

/**
 * Turn a Tina Cloud URL into the human-readable image path it points at: the
 * media-root-relative path after `/__file/`, percent-decoded so accented
 * filenames read normally (e.g. `Noe%CC%81mi-25.jpg` -> `Noémi-25.jpg`).
 */
function toImageLabel(url: string): string {
  const file = url.match(/\/__file\/(.+)$/);
  const asset = url.match(/^https?:\/\/assets\.tina\.io\/[^/]+\/(.+)$/i);
  const raw = file ? file[1] : asset ? asset[1] : url;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isExcluded(relPath: string): boolean {
  const [top] = relPath.split(sep);
  return EXCLUDED_DIRS.includes(top);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  let distExists = false;
  try {
    distExists = statSync(DIST_DIR).isDirectory();
  } catch {
    distExists = false;
  }
  if (!distExists) {
    console.error(
      `[no-tina-cloud-urls] "${DIST_DIR}/" not found. Build first (e.g. \`npm run build:local\`).`
    );
    process.exit(1);
  }

  const offenders: { file: string; count: number; images: string[] }[] = [];

  for (const file of walk(DIST_DIR)) {
    const rel = relative(DIST_DIR, file);
    if (isExcluded(rel)) {
      continue;
    }
    const dot = file.lastIndexOf(".");
    const ext = dot === -1 ? "" : file.slice(dot).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
      continue;
    }

    const content = readFileSync(file, "utf8");
    const matches = content.match(TINA_CLOUD_URL);
    if (matches) {
      const images = [...new Set(matches.map(toImageLabel))].sort((a, b) => a.localeCompare(b));
      offenders.push({ file, count: matches.length, images });
    }
  }

  if (offenders.length > 0) {
    const totalRefs = offenders.reduce((sum, o) => sum + o.count, 0);
    console.error(
      `[no-tina-cloud-urls] FAIL — ${totalRefs} Tina Cloud asset reference(s) in ${offenders.length} build output file(s).`
    );
    console.error(
      "These images were not resolved to local src/assets and now hot-link to Tina Cloud:\n"
    );
    const MAX_PER_FILE = 15;
    for (const { file, count, images } of offenders) {
      console.error(`  ${file}  (${count} reference(s), ${images.length} unique image(s))`);
      for (const image of images.slice(0, MAX_PER_FILE)) {
        console.error(`      • ${image}`);
      }
      if (images.length > MAX_PER_FILE) {
        console.error(`      … and ${images.length - MAX_PER_FILE} more`);
      }
    }
    console.error(
      "\nFix: resolve these to local assets (src/lib/assets/index.ts resolveImage / " +
        "src/lib/data.ts resolveTinaImageRefs)."
    );
    process.exit(1);
  }

  console.log(
    `[no-tina-cloud-urls] OK — no Tina Cloud asset URLs in "${DIST_DIR}/" (excluding ${EXCLUDED_DIRS.join(", ")}).`
  );
}

main();
