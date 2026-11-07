import LanguageDetector from "i18next-browser-languagedetector";
import { isLocale, locales, type Locale } from "@/lib/i18n";

// The key the i18next browser detector uses by default.
const STORAGE_KEY = "i18nextLng";

export function readStoredLocale(): Locale | undefined {
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  return stored && isLocale(stored) ? stored : undefined;
}

export function persistLocale(locale: Locale): void {
  globalThis.localStorage.setItem(STORAGE_KEY, locale);
}

export function detectNavigatorLocale(): Locale | undefined {
  const detector = new LanguageDetector(null, { order: ["navigator"], caches: [] });
  detector.init();
  const detected = detector.detect();
  const candidates = typeof detected === "string" ? [detected] : (detected ?? []);
  return candidates.flatMap((candidate) =>
    locales.filter((locale) => candidate === locale || candidate.startsWith(`${locale}-`))
  )[0];
}
