import { describe, expect, it } from "vitest";
import { automaticSyncDecision, SyncJobDataSchema, updateInputCarriesName } from "./sync-decision";

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

describe("automaticSyncDecision", () => {
  it("skips when native already matches the plan", () => {
    expect(automaticSyncDecision({ planned: "a", current: "a", synced: "b" })).toBe("skip");
  });

  it("flags drift when native differs from what the last sync wrote", () => {
    expect(automaticSyncDecision({ planned: "a", current: "c", synced: "b" })).toBe("drift");
  });

  it("writes when native is untouched since the last sync", () => {
    expect(automaticSyncDecision({ planned: "a", current: "b", synced: "b" })).toBe("write");
  });

  it("writes when no synced hash exists", () => {
    expect(automaticSyncDecision({ planned: "a", current: "b", synced: null })).toBe("write");
  });
});

describe("SyncJobDataSchema", () => {
  it("treats a job without origin as automatic", () => {
    expect(SyncJobDataSchema.parse({ productId: "p" }).origin).toBe("automatic");
  });
});
