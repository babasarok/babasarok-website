/**
 * SPA fallback for the Vendure dashboard (ADR 0008). The dashboard's static
 * files under /dashboard are served directly from the site's assets; anything
 * else under /dashboard reaches this endpoint only when no asset matched —
 * i.e. client-side-routed deep links like /dashboard/orders/<id>, which order
 * notification emails contain. Serving the SPA entry for browser navigations
 * lets the dashboard's router take over; stale hashed-asset requests after a
 * deploy keep 404-ing instead of receiving HTML.
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (request.headers.get("sec-fetch-mode") !== "navigate") {
    return new Response(null, { status: 404 });
  }

  return env.ASSETS.fetch(new Request(new URL("/dashboard/", request.url)));
};
