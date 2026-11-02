import { describe, expect, it } from "vitest";
import { createProgressCounter, progressOfJobData } from "./sync-progress";

describe("createProgressCounter", () => {
  it("reports the start and every advance, capped at the total", () => {
    const reports: Array<{ done: number; total: number }> = [];
    const counter = createProgressCounter(5, (progress) => reports.push(progress));

    counter.advance(3);
    counter.advance(9);

    expect(reports).toEqual([
      { done: 0, total: 5 },
      { done: 3, total: 5 },
      { done: 5, total: 5 },
    ]);
  });
});

describe("progressOfJobData", () => {
  it("reads reported progress and tolerates jobs that have none", () => {
    expect(progressOfJobData({ productId: "p", progress: { done: 2, total: 9 } })).toEqual({
      done: 2,
      total: 9,
    });
    expect(progressOfJobData({ productId: "p" })).toBeNull();
  });
});
