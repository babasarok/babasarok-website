import { PUBLIC_VENDURE_API_URL } from "astro:env/client";
import { createShopQuery } from "./transport";

export const CATALOG_LANGUAGE = "hu";

export const shopQuery = createShopQuery({
  fetch: (input, init) => fetch(input, init),
  apiUrl: PUBLIC_VENDURE_API_URL,
  languageCode: CATALOG_LANGUAGE,
});
