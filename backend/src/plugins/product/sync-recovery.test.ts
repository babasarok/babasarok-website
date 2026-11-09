import { describe, expect, it } from "vitest";
import { definitionsToRequeue } from "./sync-recovery";

describe("definitionsToRequeue", () => {
  it("re-queues pending definitions without a queued job", () => {
    expect(definitionsToRequeue(["a", "b", "c"], [{ productId: "b" }])).toEqual(["a", "c"]);
  });

  it("ignores job data it cannot parse", () => {
    expect(definitionsToRequeue(["a"], [{ nope: true }, null])).toEqual(["a"]);
  });

  it("re-queues nothing when every pending definition is queued", () => {
    expect(definitionsToRequeue(["a"], [{ productId: "a" }])).toEqual([]);
  });
});
