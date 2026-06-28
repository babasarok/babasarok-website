import type { APIRoute, GetStaticPaths } from "astro";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Serves the raw files in `src/assets` at the `/assets/*` URL.
 *
 * Tina stores media refs as `/assets/<file>` (mediaRoot="assets",
 * publicFolder="src") and its admin loads that URL directly. The files live
 * in `src/assets` — so Astro can also process them with `<Image>` — and NOT
 * in `public`, so this prerendered endpoint emits a static copy for each
 * asset at build time (and serves them in dev), bridging the gap without
 * duplicating anything into `public`.
 */
const ASSETS_DIR = fileURLToPath(new URL("../../../assets", import.meta.url));

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export const prerender = true;

export const getStaticPaths: GetStaticPaths = () =>
  walk(ASSETS_DIR).map((file) => ({
    params: { path: path.relative(ASSETS_DIR, file).split(path.sep).join("/") },
  }));

export const GET: APIRoute = ({ params }) => {
  const filePath = path.normalize(path.join(ASSETS_DIR, params.path ?? ""));
  // Path-traversal guard: stay inside src/assets.
  if (filePath !== ASSETS_DIR && !filePath.startsWith(ASSETS_DIR + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new Response("Not found", { status: 404 });
  }
  const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return new Response(fs.readFileSync(filePath), {
    headers: { "Content-Type": type },
  });
};
