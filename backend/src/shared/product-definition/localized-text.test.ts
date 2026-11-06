import { describe, expect, it } from "vitest";
import { LocalizedTextSchema, resolveText } from "./localized-text";

describe("LocalizedTextSchema", () => {
  it("requires hu", () => {
    expect(LocalizedTextSchema.safeParse({ en: "Wood" }).success).toBe(false);
  });

  it("accepts further languages", () => {
    expect(LocalizedTextSchema.safeParse({ hu: "Fa", en: "Wood" }).success).toBe(true);
  });

  it("rejects blank or malformed entries", () => {
    expect(LocalizedTextSchema.safeParse({ hu: "Fa", en: "" }).success).toBe(false);
    expect(LocalizedTextSchema.safeParse({ hu: "Fa", "not a code": "x" }).success).toBe(false);
  });
});

describe("resolveText", () => {
  const text = LocalizedTextSchema.parse({ hu: "Fa", en: "Wood" });

  it("returns the requested language", () => {
    expect(resolveText(text, "en")).toBe("Wood");
  });

  it("falls back to hu", () => {
    expect(resolveText(text, "de")).toBe("Fa");
  });
});
