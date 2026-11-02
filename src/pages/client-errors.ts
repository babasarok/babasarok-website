/**
 * Same-origin receiver for browser error reports. The site stays reachable
 * when the API host is not, so reports land in Workers Logs, where a
 * Cloudflare monitor on `clientError.kind = "order"` emails the operator.
 */
import type { APIRoute } from "astro";

export const prerender = false;

const MAX_REPORT_LENGTH = 64 * 1024;

function parseReport(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.text()).slice(0, MAX_REPORT_LENGTH);
  // ponytail: no rate limit; the size cap bounds each entry. Add one if Workers Logs gets flooded.
  console.warn({ clientError: parseReport(body) });

  return new Response(null, { status: 204 });
};
