import { describe, expect, it } from "vitest";
import {
  CONFIGURATOR_PRODUCTION_DAYS,
  READY_MADE_PRODUCTION_DAYS,
  productionDefaults,
  resolveProductionDays,
} from "./production-days";

describe("productionDefaults", () => {
  it("falls back to 3 weeks / 1 week when the channel sets nothing", () => {
    expect(productionDefaults(null, null)).toEqual({
      configurator: 21,
      readyMade: 7,
    });
    expect(CONFIGURATOR_PRODUCTION_DAYS).toBe(21);
    expect(READY_MADE_PRODUCTION_DAYS).toBe(7);
  });

  it("uses the channel's configured defaults", () => {
    expect(productionDefaults(14, 2)).toEqual({ configurator: 14, readyMade: 2 });
  });
});

describe("resolveProductionDays", () => {
  const defaults = productionDefaults(null, null);

  it("defaults configurator products to the configurator default", () => {
    expect(resolveProductionDays(null, true, defaults)).toBe(21);
    expect(resolveProductionDays(undefined, true, productionDefaults(14, 2))).toBe(14);
  });

  it("defaults ready-made products to the ready-made default", () => {
    expect(resolveProductionDays(null, false, defaults)).toBe(7);
    expect(resolveProductionDays(undefined, false, productionDefaults(14, 2))).toBe(2);
  });

  it("lets the product override win for both kinds", () => {
    expect(resolveProductionDays(3, true, defaults)).toBe(3);
    expect(resolveProductionDays(3, false, productionDefaults(14, 2))).toBe(3);
    expect(resolveProductionDays(0, true, defaults)).toBe(0);
  });
});
