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

export function isLocale(value: string): value is Locale {
  const candidates: readonly string[] = locales;
  return candidates.includes(value);
}

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return locales.find((locale) => locale === segment) ?? defaultLocale;
}

export function localizedPath(pathname: string, target: Locale): string {
  const current = localeFromPathname(pathname);
  const rest = current === defaultLocale ? pathname : pathname.slice(current.length + 1);
  return target === defaultLocale ? rest : `/${target}${rest}`;
}
