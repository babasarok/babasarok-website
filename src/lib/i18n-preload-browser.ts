import { localeFromPathname } from "@/lib/i18n";
import { getClientI18n } from "@/lib/i18next-client";

void getClientI18n(localeFromPathname(globalThis.location.pathname));
