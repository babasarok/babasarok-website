export const locales = ["hu", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "hu";

export const OG_LOCALE = {
  hu: "hu_HU",
  en: "en_GB",
} as const satisfies Record<Locale, string>;

export const VENDURE_LANGUAGE_CODE = {
  hu: "hu",
  en: "en",
} as const satisfies Record<Locale, string>;

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return locales.find((locale) => locale === segment) ?? defaultLocale;
}

export function localizedPath(pathname: string, target: Locale): string {
  const current = localeFromPathname(pathname);
  const rest = current === defaultLocale ? pathname : pathname.slice(current.length + 1);
  return target === defaultLocale ? rest : `/${target}${rest}`;
}

/**
 * Content-entry ids carry the locale as their first path segment
 * (`src/content/<collection>/<locale>/…`, ADR 0015 decision 4); an id without
 * a locale prefix belongs to the default locale (e.g. blog posts created at
 * the collection root by the Tina editor).
 */
export function localeFromEntryId(entryId: string): Locale {
  const [head] = entryId.split("/");
  return locales.find((locale) => locale === head) ?? defaultLocale;
}

export function entryIdForLocale(locale: Locale, name: string): string {
  return `${locale}/${name}`;
}

export function entrySlugFromId(entryId: string): string {
  const [head] = entryId.split("/");
  const headLocale = locales.find((locale) => locale === head);
  return headLocale ? entryId.slice(headLocale.length + 1) : entryId;
}
