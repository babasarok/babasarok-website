import i18next, { type i18n as I18n } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { defaultLocale, locales, type Locale } from "@/lib/i18n";

const resourceModules = import.meta.glob<{ default: object }>("../locales/*.ts");

const instances = new Map<Locale, Promise<I18n>>();

export function getClientI18n(locale: Locale): Promise<I18n> {
  const pending = instances.get(locale);
  if (pending) return pending;

  const instance = i18next.createInstance();
  instance.use(
    resourcesToBackend(async (language, namespace) => {
      if (!(locales as readonly string[]).includes(language)) {
        throw new Error(`unsupported language ${language}`);
      }
      const load = resourceModules[`../locales/${language}.ts`];
      if (!load) throw new Error(`no resource module for ${language}`);
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
