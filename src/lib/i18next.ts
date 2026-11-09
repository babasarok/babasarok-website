import { createInstance, type i18n as I18n } from "i18next";
import { defaultLocale, type Locale } from "@/lib/i18n";
import { resources } from "@/locales/resources";

export function createI18n(locale: Locale): I18n {
  const instance = createInstance({
    lng: locale,
    fallbackLng: defaultLocale,
    defaultNS: "translation",
    resources,
    interpolation: { escapeValue: false },
  });
  void instance.init();
  return instance;
}
