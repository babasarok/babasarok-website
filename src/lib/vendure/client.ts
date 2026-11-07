import { PUBLIC_VENDURE_API_URL } from "astro:env/client";
import { createShopQuery } from "./transport";

const FETCH_TIMEOUT_MS = 5000;

export const CATALOG_LANGUAGE = "hu";

export const shopQuery = createShopQuery({
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
  apiUrl: PUBLIC_VENDURE_API_URL,
  languageCode: CATALOG_LANGUAGE,
});

export const ASSET_BASE = `${PUBLIC_VENDURE_API_URL}/assets/`;
