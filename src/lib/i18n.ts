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

import { createInstance, type i18n as I18n } from "i18next";
import { resources } from "@/locales/resources";

export function createI18n(locale: Locale): I18n {
  const instance = createInstance({
    lng: locale,
    fallbackLng: defaultLocale,
    defaultNS: "translation",
    resources,
    interpolation: { escapeValue: false },
  });
  instance.init();
  return instance;
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
