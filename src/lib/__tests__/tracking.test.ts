import { describe, expect, it } from "vitest";
import { needsReload, type Consent } from "@/lib/tracking";

const at = "2026-10-22T00:00:00.000Z";
const consent = (analytics: boolean, marketing: boolean): Consent => ({
  analytics,
  marketing,
  at,
});

describe("needsReload", () => {
  it("never reloads when nothing was loaded before", () => {
    expect(needsReload(null, { analytics: true, marketing: true })).toBe(false);
  });

  it("does not reload when adding a tracker", () => {
    expect(needsReload(consent(true, false), { analytics: true, marketing: true })).toBe(false);
  });

  it("does not reload when a tracker stays loaded under the other purpose", () => {
    // GTM stays loaded (now for marketing) even though analytics is withdrawn.
    expect(needsReload(consent(true, false), { analytics: false, marketing: true })).toBe(false);
  });

  it("reloads when the last GTM purpose is withdrawn", () => {
    expect(needsReload(consent(true, false), { analytics: false, marketing: false })).toBe(true);
  });

  it("reloads when marketing (Meta) is withdrawn", () => {
    expect(needsReload(consent(false, true), { analytics: false, marketing: false })).toBe(true);
    expect(needsReload(consent(true, true), { analytics: true, marketing: false })).toBe(true);
  });
});
