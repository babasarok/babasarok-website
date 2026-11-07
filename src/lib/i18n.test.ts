import { describe, expect, it } from "vitest";
import {
  createI18n,
  defaultLocale,
  localeFromPathname,
  localizedPath,
  locales,
  type Locale,
} from "./i18n";

describe("createI18n", () => {
  it("resolves typed keys per locale", () => {
    expect(createI18n("hu").t("languageNames.en")).toBe("English");
    expect(createI18n("en").t("languageNames.hu")).toBe("Magyar");
  });

  it("rejects keys missing from the resources at compile time", () => {
    const i18n = createI18n("hu");
    // @ts-expect-error unknown keys fail astro check
    expect(i18n.t("languageNames.sk")).toBe("languageNames.sk");
  });

  it("checks English key completeness against the Hungarian source", () => {
    const en = createI18n("en");
    expect(en.t("languageNames.hu")).toBe(createI18n("hu").t("languageNames.hu"));
  });
});

describe("localeFromPathname", () => {
  it.each([
    ["/", defaultLocale],
    ["/product/babafeszek/", defaultLocale],
    ["/en/", "en"],
    ["/en/product/babafeszek/", "en"],
    ["/english/", defaultLocale],
    ["/en/en/", "en"],
  ])("derives %s → %s", (pathname, expected) => {
    expect(localeFromPathname(pathname)).toBe(expected);
  });

  it("covers every locale declared in the locales array", () => {
    for (const locale of locales) {
      expect(localeFromPathname(`/${locale}/`)).toBe(locale);
    }
  });
});

describe("localizedPath", () => {
  const cases = [
    { pathname: "/", target: "en", expected: "/en/" },
    { pathname: "/contact/", target: "en", expected: "/en/contact/" },
    { pathname: "/blog/first-post/", target: "en", expected: "/en/blog/first-post/" },
    { pathname: "/en/blog/first-post/", target: "hu", expected: "/blog/first-post/" },
    { pathname: "/en/", target: "hu", expected: "/" },
    { pathname: "/en/contact/", target: "en", expected: "/en/contact/" },
    { pathname: "/contact/", target: "hu", expected: "/contact/" },
  ] satisfies Array<{ pathname: string; target: Locale; expected: string }>;

  for (const { pathname, target, expected } of cases) {
    it(`maps ${pathname} → ${target} as ${expected}`, () => {
      expect(localizedPath(pathname, target)).toBe(expected);
    });
  }
});
