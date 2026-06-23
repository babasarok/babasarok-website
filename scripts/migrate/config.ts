/**
 * Shared paths + constants for the Hugo -> Astro migration scripts.
 *
 * Every script is idempotent and safe to re-run: they read from `old/`
 * (the frozen Hugo source) and (re)write into the new Astro tree, so we
 * can iterate on the migration repeatedly while fixing bugs.
 *
 * Run with Node 24+ (native TypeScript): `node scripts/migrate/<name>.ts`.
 * Paths are resolved from the repo root, so always run from there.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");

const r = (...p: string[]) => path.join(REPO_ROOT, ...p);

/** Frozen Hugo source we are migrating away from. */
export const OLD = {
  root: r("old"),
  assets: r("old", "assets"),
  images: r("old", "assets", "images"),
  scss: r("old", "assets", "scss"),
  data: r("old", "data"),
  content: r("old", "content"),
  layouts: r("old", "layouts"),
  static: r("old", "static"),
} as const;

/** New Astro tree we are migrating into. */
export const NEW = {
  src: r("src"),
  /** All site imagery lives here so Astro can process it + Tina can find it. */
  assets: r("src", "assets"),
  content: r("src", "content"),
  /** Normalized landing-section data, consumed by Tina collections. */
  sections: r("src", "content", "sections"),
} as const;

/** Where scripts write their human-readable reports. */
export const REPORTS = r("scripts", "migrate", ".reports");

/**
 * Tina/Astro asset convention. Files copied into `src/assets/...` are
 * referenced as `/assets/...` (Tina mediaRoot="assets", publicFolder="src").
 * A runtime helper maps `/assets/...` back to the Astro-imported module.
 */
export const ASSET_PUBLIC_PREFIX = "/assets";

/** Landing-page sections in render order (old/layouts/index.html). */
export const SECTIONS = [
  "hero",
  "service",
  "resume",
  "about",
  "product",
  "testimonial",
  "blog",
] as const;

export type SectionName = (typeof SECTIONS)[number];

/** Maps a section name to its old Hugo data file. */
export const SECTION_DATA_FILE: Record<SectionName, string> = {
  hero: "hero.yml",
  service: "serviceSection.yml",
  resume: "resumeSection.yml",
  about: "aboutSection.yml",
  product: "productSection.yml",
  testimonial: "testimonialSection.yml",
  blog: "blogSection.yml",
};

/** Image-like file extensions we treat as migratable assets. */
export const ASSET_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".svg",
  ".webp",
  ".avif",
  ".gif",
  ".pdf",
  ".ico",
];
