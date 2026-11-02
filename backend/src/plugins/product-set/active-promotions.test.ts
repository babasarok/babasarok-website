import { describe, expect, it } from "vitest";
import { countActivePromotionsUsing, type PromotionWindow } from "./active-promotions";

const NOW = new Date("2026-06-01T12:00:00Z");
const CODE = "set";

function promotion(overrides: Partial<PromotionWindow> = {}): PromotionWindow {
  return {
    deletedAt: null,
    startsAt: null,
    endsAt: null,
    channels: [{ id: 1 }],
    conditions: [{ code: CODE }],
    ...overrides,
  };
}

function count(promotions: PromotionWindow[]): number {
  return countActivePromotionsUsing(promotions, CODE, 1, NOW);
}

describe("countActivePromotionsUsing", () => {
  it("counts a live promotion", () => {
    expect(count([promotion()])).toBe(1);
  });

  it("ignores a soft-deleted promotion", () => {
    expect(count([promotion(), promotion({ deletedAt: NOW })])).toBe(1);
  });

  it("ignores a future promotion", () => {
    expect(count([promotion(), promotion({ startsAt: new Date("2026-07-01") })])).toBe(1);
  });

  it("ignores an expired promotion", () => {
    expect(count([promotion({ endsAt: new Date("2026-05-01") })])).toBe(0);
  });

  it("ignores another channel", () => {
    expect(count([promotion(), promotion({ channels: [{ id: 2 }] })])).toBe(1);
  });

  it("ignores promotions without the condition", () => {
    expect(count([promotion({ conditions: [{ code: "other" }] })])).toBe(0);
  });

  it("counts two real ones", () => {
    expect(count([promotion(), promotion()])).toBe(2);
  });
});
