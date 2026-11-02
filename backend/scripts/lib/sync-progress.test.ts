import { describe, expect, it } from "vitest";
import { formatSyncProgress } from "./sync-progress";

describe("formatSyncProgress", () => {
  it("formats pending count, names, elapsed clock and counters", () => {
    expect(formatSyncProgress(["hagyomanyos-racsvedo", "polya"], 12 * 60_000 + 34_000, 31, 0)).toBe(
      "… várakozás: 2 függő (hagyomanyos-racsvedo, polya) — " +
        "12:34 eltelt, 31 szinkronizálva, 0 sikertelen"
    );
  });

  it("pads the clock below a minute and grows past an hour", () => {
    expect(formatSyncProgress(["a"], 5000, 0, 1)).toBe(
      "… várakozás: 1 függő (a) — 00:05 eltelt, 0 szinkronizálva, 1 sikertelen"
    );
    expect(formatSyncProgress(["a"], 4_500_000, 3, 2)).toBe(
      "… várakozás: 1 függő (a) — 75:00 eltelt, 3 szinkronizálva, 2 sikertelen"
    );
  });
});
