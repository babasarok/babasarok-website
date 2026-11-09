import { atom } from "nanostores";
import type { i18n as I18n } from "i18next";
import { defaultLocale, localeFromPathname, type Locale } from "@/lib/i18n";
import { getClientI18n } from "@/lib/i18next-client";

export const $locale = atom<Locale>(defaultLocale);
export const $i18n = atom<I18n | null>(null);

/** Client-only: called once by the before-hydration preload. */
export function initI18nBrowser(): void {
  const locale = localeFromPathname(globalThis.location.pathname);
  $locale.set(locale);
  void getClientI18n(locale).then((i18n) => {
    $i18n.set(i18n);
  });
}
