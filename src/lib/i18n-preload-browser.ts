import { localeFromPathname } from "@/lib/i18n";
import { localeStore } from "@/lib/locale-store";
import { getClientI18n } from "@/lib/i18next-client";

const locale = localeFromPathname(globalThis.location.pathname);
localeStore.set(locale);
void getClientI18n(locale);
