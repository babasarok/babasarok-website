import { describe, expect, it } from "vitest";
import { messageLanguage, messages } from "./messages";

describe("messageLanguage", () => {
  it("maps the site locales and falls back to Hungarian", () => {
    expect(messageLanguage("en")).toBe("en");
    expect(messageLanguage("hu")).toBe("hu");
    expect(messageLanguage("de")).toBe("hu");
    expect(messageLanguage("")).toBe("hu");
  });
});

describe("messages", () => {
  it("returns Hungarian and English tables for the same keys", () => {
    expect(Object.keys(messages("hu"))).toEqual(Object.keys(messages("en")));
  });

  it("formats the same message in both languages", () => {
    expect(messages("hu").deliveryFree()).toBe("ingyenes");
    expect(messages("en").deliveryFree()).toBe("free");
  });

  it("falls back to Hungarian for unknown languages", () => {
    expect(messages("de").deliveryFree()).toBe("ingyenes");
  });
});
