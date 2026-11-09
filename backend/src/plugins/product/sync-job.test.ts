import { describe, expect, it } from "vitest";
import { SyncJobDataSchema, updateInputCarriesName } from "./sync-job";

describe("updateInputCarriesName", () => {
  it("is true when any translation has a name", () => {
    expect(updateInputCarriesName({ id: 1, translations: [{ name: "Új" }] })).toBe(true);
  });

  it("is false without translations, names or an object input", () => {
    expect(updateInputCarriesName({ id: 1, enabled: true })).toBe(false);
    expect(updateInputCarriesName({ translations: [{ description: "x" }] })).toBe(false);
    expect(updateInputCarriesName(5)).toBe(false);
  });
});

describe("SyncJobDataSchema", () => {
  it("reads a job queued before the actor existed as system-triggered", () => {
    expect(SyncJobDataSchema.parse({ productId: "p", origin: "automatic" })).toEqual({
      productId: "p",
      actor: null,
    });
  });
});
