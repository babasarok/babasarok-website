/**
 * The API URL preview frontends bake in at build time. The branch (injected
 * by Workers Builds) names the preview stack, so the URL must match the slug
 * the backend deploy used — one shared pure function, not a dashboard
 * build-command export that can silently go missing.
 */

import { previewSlug } from "./preview-slug";

export function previewApiUrl(options: {
  branch?: string | undefined;
  stack?: string | undefined;
}): string | undefined {
  if (options.stack !== "preview" || !options.branch) {
    return undefined;
  }

  try {
    const slug = previewSlug(options.branch);
    return `https://api-${slug}.babasarok.net`;
  } catch (e) {
    throw new Error(
      `preview build: cannot derive the API URL from branch '${options.branch}': ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
