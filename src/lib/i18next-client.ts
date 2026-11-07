import i18next, { type i18n as I18n } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { defaultLocale, locales, type Locale } from "@/lib/i18n";

const resourceModules = import.meta.glob<{ default: object }>("../locales/*.ts");

const instances = new Map<Locale, Promise<I18n>>();

export function getClientI18n(locale: Locale): Promise<I18n> {
  const pending = instances.get(locale);
  if (pending) {
    return pending;
  }

  const instance = i18next.createInstance();
  instance.use(
    resourcesToBackend(async (language: string, namespace: string) => {
      if (!(locales as readonly string[]).includes(language)) {
        throw new Error(`unsupported language ${language}`);
      }

      const key = `../locales/${language}.ts`;

      if (!(key in resourceModules)) {
        throw new Error(`no resource module for ${language}`);
      }

      const load = resourceModules[key];

      if (namespace !== "translation") {
        throw new Error(`unsupported namespace ${namespace}`);
      }

      const { default: translation } = await load();
      return translation;
    })
  );

  const created = instance
    .init({
      lng: locale,
      fallbackLng: defaultLocale,
      defaultNS: "translation",
      interpolation: { escapeValue: false },
    })
    .then(() => instance);

  instances.set(locale, created);
  return created;
}

// Messages flowing through the basket layer are either a dictionary key
// (blockers, error codes) or a server-provided sentence; resolve only the
// former, pass the latter through untouched.
export function translateMessage(i18n: I18n, message: string): string {
  return i18n.exists(message) ? i18n.t(message, { defaultValue: message }) : message;
}
