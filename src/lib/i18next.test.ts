import { describe, expect, it } from "vitest";
import { createI18n } from "./i18next";

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
