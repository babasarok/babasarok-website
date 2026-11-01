/**
 * Branch name → preview slug: the single identity used for the stack dir
 * (/srv/babasarok/<slug>), the compose project (babasarok-<slug>), the
 * container alias (vendure-<slug>), the API host (api-<slug>.babasarok.net)
 * and the branch database (babasarok_preview_<slug>). Shared by the
 * Cloudflare frontend build (preview API URL) and the backend deploy so both
 * sides always agree. Fail-closed: throws when nothing usable remains.
 */

const MAX_SLUG_LENGTH = 40;

/** Stack dirs on the box that previews must never collide with. */
const RESERVED_SLUGS = new Set(["prod", "test", "infra"]);

export function previewSlug(branch: string): string {
  const slug = branch
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "");

  if (slug === "" || RESERVED_SLUGS.has(slug)) {
    throw new Error(`branch '${branch}' maps to unusable slug '${slug}'`);
  }

  return slug;
}
