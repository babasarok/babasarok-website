import { describe, expect, it } from "vitest";
import { memoPerRequest } from "./request-memo";

describe("memoPerRequest", () => {
  it("loads once per key object, even for concurrent callers", async () => {
    let loads = 0;
    const memo = memoPerRequest(async (_key: object) => ++loads);
    const first = {};
    const second = {};

    const results = await Promise.all([memo(first), memo(first), memo(second)]);

    expect(results).toEqual([1, 1, 2]);
    expect(loads).toBe(2);
  });
});
