import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  entryIdForLocale,
  entrySlugFromId,
  frontDoorRedirect,
  localeFromEntryId,
  localeFromPathname,
  localizedPath,
  locales,
  type Locale,
} from "./i18n";

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

describe("frontDoorRedirect", () => {
  const cases = [
    { pathname: "/", preferred: undefined, expected: undefined },
    { pathname: "/", preferred: "hu", expected: undefined },
    { pathname: "/", preferred: "en", expected: "en" },
    { pathname: "/en/", preferred: "hu", expected: undefined },
    { pathname: "/en/", preferred: "en", expected: undefined },
    { pathname: "/blog/first-post/", preferred: "en", expected: undefined },
  ] satisfies Array<{ pathname: string; preferred?: Locale; expected?: Locale }>;

  for (const { pathname, preferred, expected } of cases) {
    it(`${pathname} with preference ${preferred ?? "none"} → ${expected ?? "stay"}`, () => {
      expect(frontDoorRedirect(pathname, preferred)).toBe(expected);
    });
  }
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

// Seam: content-entry ids (Astro glob loader) vs. the page locale — directory-
// based Tina localization (ADR 0015 decision 4) encodes the locale as the
// first path segment of the entry id.
describe("localeFromEntryId", () => {
  it.each([
    ["hu/malyva", "hu"],
    ["en/malyva", "en"],
    ["hu/blog/_index", "hu"],
    // Root-level documents created outside the locale folders (e.g. a blog
    // post saved at the collection root by the Tina editor) are hu.
    ["malyva", defaultLocale],
  ])("derives %s → %s", (entryId, expected) => {
    expect(localeFromEntryId(entryId)).toBe(expected);
  });

  it("covers every locale declared in the locales array", () => {
    for (const locale of locales) {
      expect(localeFromEntryId(`${locale}/any`)).toBe(locale);
    }
  });
});

describe("entryIdForLocale", () => {
  it("builds the per-locale entry id", () => {
    expect(entryIdForLocale("hu", "config")).toBe("hu/config");
    expect(entryIdForLocale("en", "config")).toBe("en/config");
  });
});

describe("entrySlugFromId", () => {
  it.each([
    ["hu/malyva", "malyva"],
    ["en/malyva", "malyva"],
    ["hu/blog/_index", "blog/_index"],
    ["malyva", "malyva"],
  ])("strips the locale segment from %s → %s", (entryId, expected) => {
    expect(entrySlugFromId(entryId)).toBe(expected);
  });

  it("keeps hu and en slugs identical so hreflang alternates pair 1:1", () => {
    expect(entrySlugFromId("hu/Vilagosmalyva")).toBe(entrySlugFromId("en/Vilagosmalyva"));
  });
});
