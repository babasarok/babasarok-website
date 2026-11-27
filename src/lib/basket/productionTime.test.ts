import { describe, expect, it } from "vitest";
import type { Order, OrderLine } from "./schemas";
import { productionNote, productionTimeLabel } from "./productionTime";

const translate = (key: string, vars?: Record<string, unknown>): string => {
  const table: Record<string, string> = {
    "checkout.productionTimeNote": `NOTE ${String(vars?.time)}`,
    "checkout.productionWeeks": `${String(vars?.n)} weeks`,
    "checkout.productionOneWeek": "1 week",
    "checkout.productionDays": `${String(vars?.n)} days`,
    "checkout.productionOneDay": "1 day",
  };

  return table[key];
};

const line = (productionTimeDays: number): OrderLine =>
  ({
    productVariant: { product: { productionTimeDays } },
  }) as unknown as OrderLine;

const order = (lines: OrderLine[]): Order => ({ lines }) as unknown as Order;

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

describe("productionNote", () => {
  it("shows the longest line's production time", () => {
    expect(productionNote(order([line(7), line(21)]), translate)).toBe("NOTE 3 weeks");
    expect(productionNote(order([line(21), line(3)]), translate)).toBe("NOTE 3 weeks");
    expect(productionNote(order([line(3)]), translate)).toBe("NOTE 3 days");
    expect(productionNote(order([line(7)]), translate)).toBe("NOTE 1 week");
  });

  it("is undefined for an empty basket", () => {
    expect(productionNote(order([]), translate)).toBeUndefined();
  });
});
