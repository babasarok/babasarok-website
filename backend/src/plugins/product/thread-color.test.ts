import { describe, expect, it } from "vitest";
import { hexColorError, unknownThreadColorRejection } from "./thread-color";

describe("hexColorError", () => {
  it("accepts #rrggbb and an empty value", () => {
    expect(hexColorError("#9caf88")).toBeUndefined();
    expect(hexColorError("#9CAF88")).toBeUndefined();
    expect(hexColorError(null)).toBeUndefined();
    expect(hexColorError("")).toBeUndefined();
  });

  it("rejects anything else with a Hungarian message", () => {
    expect(hexColorError("9caf88")).toContain("#rrggbb");
    expect(hexColorError("#fff")).toContain("#rrggbb");
    expect(hexColorError("#9caf8g")).toContain("#rrggbb");
    expect(hexColorError(12)).toContain("#rrggbb");
  });
});

describe("unknownThreadColorRejection", () => {
  it("names the unknown color ids", () => {
    expect(unknownThreadColorRejection(["lila", "kek"], "hu")).toBe(
      "Ismeretlen hímzőcérna-szín: lila, kek."
    );
  });

  it("names the unknown color ids in English", () => {
    expect(unknownThreadColorRejection(["lila", "kek"], "en")).toBe(
      "Unknown embroidery thread colour: lila, kek."
    );
  });
});
