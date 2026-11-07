import { atom } from "nanostores";
import { defaultLocale, type Locale } from "@/lib/i18n";

/**
 * The page's locale on the client. The before-hydration preload
 * (integrations/i18n-preload.ts) sets it from the URL before any island
 * hydrates; server-side rendering never reads it — islands receive the
 * locale as a prop for their SSR pass.
 */
export const localeStore = atom<Locale>(defaultLocale);
