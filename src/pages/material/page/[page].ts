import type { APIRoute } from "astro";
import { localeFromPathname, localizedPath } from "@/lib/i18n";

export const prerender = false;

export const GET: APIRoute = ({ redirect, url }) =>
  redirect(localizedPath("/material", localeFromPathname(url.pathname)), 301);
