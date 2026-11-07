import { describe, expect, it } from "vitest";
import { getClientI18n } from "./i18next-client";

describe("getClientI18n", () => {
  it("lazily loads the requested language through the backend", async () => {
    const en = await getClientI18n("en");
    expect(en.t("languageNames.hu")).toBe("Magyar");

    const hu = await getClientI18n("hu");
    expect(hu.t("languageNames.en")).toBe("English");
  });

  it("reuses one instance per language across callers", async () => {
    const [first, second] = await Promise.all([getClientI18n("hu"), getClientI18n("hu")]);
    expect(first).toBe(second);
  });

  it("runs a single instance across import specifiers", async () => {
    const aliased = await import("@/lib/i18next-client");
    const [relative, viaAlias] = await Promise.all([
      getClientI18n("en"),
      aliased.getClientI18n("en"),
    ]);
    expect(relative).toBe(viaAlias);
  });

  it("falls back to the default locale for unsupported runtime languages", async () => {
    const instance = await getClientI18n("sk" as never);
    expect(instance.t("languageNames.en")).toBe("English");
  });
});
