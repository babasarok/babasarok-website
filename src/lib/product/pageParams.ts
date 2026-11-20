import { localizedPath, type Locale } from "@/lib/i18n";

/** The `count` query param as a quantity (integer ≥ 1), or undefined. */
export function countFromParams(params: URLSearchParams): number | undefined {
  const count = params.get("count");
  if (count == null) {
    return undefined;
  }
  const parsed = Number.parseInt(count, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
}

/** A product page's path in `locale`, with the query appended when it carries any params. */
export function productPath(slug: string, locale: Locale, params = new URLSearchParams()): string {
  const path = localizedPath(`/product/${slug}/`, locale);
  const query = params.toString();

  if (query === "") {
    return path;
  }

  return `${path}?${query}`;
}
