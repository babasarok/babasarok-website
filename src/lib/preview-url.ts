/**
 * The API URL preview frontends bake in at build time. The branch (injected
 * by Workers Builds) names the preview stack, so the URL must match the slug
 * the backend deploy used — resolved by the same script, not a dashboard
 * build-command export that can silently go missing.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

export function previewApiUrl(options: {
  branch?: string | undefined;
  stack?: string | undefined;
}): string | undefined {
  if (options.stack !== "preview" || !options.branch) {
    return undefined;
  }

  const script = path.resolve(process.cwd(), "scripts/preview-slug.sh");
  let slug: string;
  try {
    slug = execFileSync("bash", [script, options.branch], { encoding: "utf8" }).trim();
  } catch (e) {
    throw new Error(
      `preview build: cannot derive the API URL from branch '${options.branch}': ${e instanceof Error ? e.message : String(e)}`
    );
  }
  return `https://api-${slug}.babasarok.net`;
}
