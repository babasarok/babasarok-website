import { describe, expect, it } from "vitest";
import { lockOrder } from "./material-lock";

describe("lockOrder", () => {
  it("sorts and de-duplicates so every transaction locks in the same order", () => {
    expect(lockOrder(["wood", "alu", "wood", "glass"])).toEqual(["alu", "glass", "wood"]);
  });
});
