import { describe, expect, it } from "vitest";
import { productionTimeLabel } from "./productionTime";

const translate = (key: string, vars?: Record<string, unknown>): string => {
  const table: Record<string, string> = {
    "productionTime.weeks": `${String(vars?.n)} weeks`,
    "productionTime.week": "1 week",
    "productionTime.days": `${String(vars?.n)} days`,
    "productionTime.day": "1 day",
  };

  return table[key];
};

describe("productionTimeLabel", () => {
  it("words whole weeks in weeks", () => {
    expect(productionTimeLabel(21, translate)).toBe("3 weeks");
    expect(productionTimeLabel(7, translate)).toBe("1 week");
  });

  it("words the rest in days", () => {
    expect(productionTimeLabel(3, translate)).toBe("3 days");
    expect(productionTimeLabel(1, translate)).toBe("1 day");
    expect(productionTimeLabel(10, translate)).toBe("10 days");
  });
});
