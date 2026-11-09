import { frontDoorRedirect, localizedPath } from "@/lib/i18n";
import { detectNavigatorLocale, persistLocale, readStoredLocale } from "@/lib/browser-locale";
import { initI18nBrowser } from "@/lib/i18n-store";

const stored = readStoredLocale();
const preferred = stored ?? detectNavigatorLocale();
const redirect = frontDoorRedirect(globalThis.location.pathname, preferred);

if (redirect) {
  if (!stored) {
    persistLocale(redirect);
  }
  globalThis.location.replace(localizedPath("/", redirect));
} else {
  initI18nBrowser();
}
